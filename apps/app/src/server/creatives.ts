import "server-only";
import { staticModelChoices } from "./static-options";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  dbReady,
  brandKits,
  brands,
  briefs,
  concepts,
  creatives,
  generationEvents,
  products,
  projects,
  renders,
  variants,
  type BrandKitData,
} from "@adcraft/db";
import { defaultModel, imageModels } from "@adcraft/ai";
import { getPlacement, type PlacementSpec } from "@adcraft/specs";
import { normalizeDocument, STATIC_TEMPLATES, type StaticAdDocument, type StaticTemplate } from "@adcraft/render";
import { withDefaults } from "@/lib/brand-kit";
import { dispatch } from "./jobs";
import "@/pipelines";

/** Placements every static creative is rendered for (PLAN.md §3: 1:1, 4:5, 9:16, 16:9). */
export const STATIC_PLACEMENT_IDS = ["meta.feed.1x1", "meta.feed.4x5", "meta.stories.9x16", "youtube.instream.16x9"] as const;

export { STATIC_SCENE_CREDITS } from "@/pipelines/static";

export type CreativeStatus = "ready" | "rendering" | "failed";

export type CreativeListItem = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  status: CreativeStatus;
  ratio: string;
  previewUrl: string | null;
  model: string | null;
  headline: string | null;
  sizes: { done: number; total: number };
  updatedAt: Date;
};

export type VariantWithRender = {
  id: string;
  placementId: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  render: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    outputKey: string | null;
    fileBytes: number | null;
    error: string | null;
    createdAt: Date;
  } | null;
};

export type CreativeDetail = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  status: CreativeStatus;
  document: StaticAdDocument;
  concept: { id: string; title: string; briefId: string };
  variants: VariantWithRender[];
  generating: { label: string; detail: string; startedAt: Date } | null;
  lastError: string | null;
  updatedAt: Date;
};

// ---------- helpers ----------

/** Creative → brand via concept → brief → project. */
function brandScoped(orgId: string, brandId: string | null) {
  return brandId ? and(eq(creatives.orgId, orgId), eq(projects.brandId, brandId)) : eq(creatives.orgId, orgId);
}

/** Latest render row per variant. */
function latestPerVariant<T extends { variantId: string; createdAt: Date }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const prev = out.get(r.variantId);
    if (!prev || r.createdAt > prev.createdAt) out.set(r.variantId, r);
  }
  return out;
}

function statusOf(latest: Array<{ status: string } | null | undefined>, generating: boolean, eventFailed: boolean): CreativeStatus {
  if (generating) return "rendering";
  const present = latest.filter((r): r is { status: string } => Boolean(r));
  if (present.some((r) => r.status === "queued" || r.status === "running")) return "rendering";
  if (present.some((r) => r.status === "failed") || eventFailed) return "failed";
  if (present.length === 0) return eventFailed ? "failed" : "rendering";
  return "ready";
}

async function eventsFor(orgId: string, creativeIds: string[]) {
  if (creativeIds.length === 0) return [] as Array<typeof generationEvents.$inferSelect>;
  return db
    .select()
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), inArray(generationEvents.creativeId, creativeIds)))
    .orderBy(desc(generationEvents.createdAt));
}

// ---------- reads ----------

export async function listCreatives(
  orgId: string,
  brandId: string | null,
  filter: { kind?: string; status?: string } = {},
): Promise<CreativeListItem[]> {
  await dbReady;
  const rows = await db
    .select({ creative: creatives, concept: concepts })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandScoped(orgId, brandId))
    .orderBy(desc(creatives.updatedAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.creative.id);
  const [vs, rs, evs] = await Promise.all([
    db.select().from(variants).where(inArray(variants.creativeId, ids)),
    db
      .select()
      .from(renders)
      .innerJoin(variants, eq(variants.id, renders.variantId))
      .where(inArray(variants.creativeId, ids)),
    eventsFor(orgId, ids),
  ]);
  const latest = latestPerVariant(rs.map((r) => r.renders));

  const items = rows.map(({ creative, concept }) => {
    const mine = vs.filter((v) => v.creativeId === creative.id);
    const latestMine = mine.map((v) => latest.get(v.id) ?? null);
    const myEvents = evs.filter((e) => e.creativeId === creative.id);
    const generating = myEvents.some((e) => e.status === "started");
    const eventFailed = myEvents[0]?.status === "failed";
    const doneVariant = mine.find((v) => latest.get(v.id)?.status === "succeeded" && latest.get(v.id)?.outputKey);
    const preview = doneVariant ? latest.get(doneVariant.id) : null;
    const doc = creative.document as Partial<StaticAdDocument>;
    return {
      id: creative.id,
      name: creative.name,
      kind: creative.kind,
      status: statusOf(latestMine, generating, eventFailed),
      ratio: doneVariant?.ratio ?? mine[0]?.ratio ?? "4:5",
      previewUrl: preview?.outputKey
        ? preview.mimeType?.startsWith("video/")
          ? typeof preview.meta?.posterKey === "string"
            ? `/api/files/${preview.meta.posterKey}`
            : null
          : `/api/files/${preview.outputKey}`
        : null,
      model: (doc.meta?.model as string | undefined) ?? concept.model ?? null,
      headline: doc.headline ?? concept.data.headline ?? null,
      sizes: { done: latestMine.filter((r) => r?.status === "succeeded").length, total: mine.length },
      updatedAt: creative.updatedAt,
    } satisfies CreativeListItem;
  });

  return items.filter((i) => (!filter.kind || i.kind === filter.kind) && (!filter.status || i.status === filter.status));
}

export async function getCreative(orgId: string, creativeId: string): Promise<CreativeDetail | null> {
  await dbReady;
  const [row] = await db
    .select({ creative: creatives, concept: concepts })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId)))
    .limit(1);
  if (!row) return null;

  const [vs, rs, evs] = await Promise.all([
    db.select().from(variants).where(eq(variants.creativeId, creativeId)).orderBy(variants.createdAt),
    db
      .select({ r: renders })
      .from(renders)
      .innerJoin(variants, eq(variants.id, renders.variantId))
      .where(eq(variants.creativeId, creativeId)),
    eventsFor(orgId, [creativeId]),
  ]);
  const latest = latestPerVariant(rs.map((x) => x.r));
  const running = evs.find((e) => e.status === "started");
  const failedEvent = evs[0]?.status === "failed" ? evs[0] : null;
  const doc = normalizeDocument(row.creative.document as unknown as StaticAdDocument);

  const variantRows: VariantWithRender[] = vs.map((v) => {
    const r = latest.get(v.id);
    let label = v.placementId;
    try {
      label = getPlacement(v.placementId).label;
    } catch {
      /* unknown placement id: keep the raw id */
    }
    return {
      id: v.id,
      placementId: v.placementId,
      label,
      ratio: v.ratio,
      width: v.width,
      height: v.height,
      render: r ? { id: r.id, status: r.status, outputKey: r.outputKey, fileBytes: r.fileBytes, error: r.error, createdAt: r.createdAt } : null,
    };
  });

  const renderError = variantRows.find((v) => v.render?.status === "failed")?.render?.error ?? null;
  return {
    id: row.creative.id,
    name: row.creative.name,
    kind: row.creative.kind,
    status: statusOf(
      variantRows.map((v) => v.render),
      Boolean(running),
      Boolean(failedEvent),
    ),
    document: doc,
    concept: { id: row.concept.id, title: row.concept.title, briefId: row.concept.briefId },
    variants: variantRows,
    generating: running
      ? {
          label: (running.meta?.label as string | undefined) ?? `${running.capability} · ${running.model}`,
          detail: (running.meta?.detail as string | undefined) ?? running.model,
          startedAt: running.createdAt,
        }
      : null,
    lastError: failedEvent?.error ?? renderError ?? (doc.meta?.lastError as string | undefined) ?? null,
    updatedAt: row.creative.updatedAt,
  };
}

export type ConceptForCreative = {
  id: string;
  title: string;
  briefId: string;
  briefTitle: string;
  data: typeof concepts.$inferSelect["data"];
  brand: { id: string; name: string; kit: BrandKitData };
  product: { id: string; name: string; cutoutKey: string | null; imageKey: string | null } | null;
  existingCreatives: number;
};

/** A concept plus everything a new creative needs (brand kit, product), scoped to the org. */
export async function getConceptForCreative(orgId: string, conceptId: string): Promise<ConceptForCreative | null> {
  await dbReady;
  const [row] = await db
    .select({ concept: concepts, brief: briefs, project: projects, brand: brands })
    .from(concepts)
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(concepts.id, conceptId), eq(concepts.orgId, orgId)))
    .limit(1);
  if (!row) return null;

  const [kit] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.brandId, row.brand.id), eq(brandKits.isActive, true)))
    .orderBy(desc(brandKits.version))
    .limit(1);
  const product = row.brief.productId
    ? (await db.select().from(products).where(eq(products.id, row.brief.productId)).limit(1))[0] ?? null
    : null;
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(creatives).where(eq(creatives.conceptId, conceptId));

  return {
    id: row.concept.id,
    title: row.concept.title,
    briefId: row.brief.id,
    briefTitle: row.brief.title,
    data: row.concept.data,
    brand: { id: row.brand.id, name: row.brand.name, kit: withDefaults(kit?.data) },
    product: product ? { id: product.id, name: product.name, cutoutKey: product.cutoutKey, imageKey: product.imageKey } : null,
    existingCreatives: count?.n ?? 0,
  };
}

export const imageModelChoices = staticModelChoices;

export function isTemplate(t: string): t is StaticTemplate {
  return STATIC_TEMPLATES.some((x) => x.id === t);
}

// ---------- document construction ----------

export function buildDocumentFromConcept(c: ConceptForCreative, opts: { template: StaticTemplate; model: string }): StaticAdDocument {
  const kit = c.brand.kit;
  const cutoutKey = c.product?.cutoutKey ?? c.product?.imageKey ?? null;
  const hook = c.data.hook?.trim();
  return normalizeDocument({
    template: opts.template,
    scene: { kind: "gradient", from: kit.colors.primary, to: kit.colors.accent ?? "#e65c32", angle: 160 },
    product: cutoutKey ? { cutoutKey, cutoutUrl: `/api/files/${cutoutKey}`, scale: 1, x: 0, y: 0 } : null,
    headline: c.data.headline,
    subhead: hook && hook.length <= 110 && hook !== c.data.headline ? hook : undefined,
    cta: c.data.cta,
    brand: {
      name: c.brand.name,
      logoUrl: kit.logoUrl,
      colors: {
        primary: kit.colors.primary,
        accent: kit.colors.accent ?? "#e65c32",
        background: kit.colors.background ?? "#f8f7f3",
        text: kit.colors.text ?? "#242521",
      },
      fonts: { heading: kit.fonts.heading, body: kit.fonts.body },
    },
    layout: { align: "left", headlineSize: 84, overlay: 0.55 },
    meta: {
      model: opts.model,
      conceptId: c.id,
      productId: c.product?.id ?? null,
      visualDirection: c.data.visualDirection,
      tone: kit.voice?.tone ?? [],
      usedOriginalPhoto: Boolean(c.product && !c.product.cutoutKey && c.product.imageKey),
    },
  });
}

// ---------- writes (called from server actions) ----------

export async function createCreativeFromConcept(
  orgId: string,
  conceptId: string,
  opts: { model?: string; template?: string; templateId?: string },
): Promise<{ creativeId: string }> {
  await dbReady;
  const c = await getConceptForCreative(orgId, conceptId);
  if (!c) throw new Error("Concept not found");
  const model = imageModels.some((m) => m.id === opts.model) ? (opts.model as string) : defaultModel("image").id;

  // A saved template (Release 3) contributes its layout choices; copy and product come from the concept.
  let saved: Partial<StaticAdDocument> | null = null;
  if (opts.templateId) {
    const { templates } = await import("@adcraft/db");
    const t = await db.query.templates.findFirst({ where: and(eq(templates.id, opts.templateId), eq(templates.orgId, orgId)) });
    if (t?.kind === "static") saved = t.document as Partial<StaticAdDocument>;
  }
  const template: StaticTemplate = opts.template && isTemplate(opts.template) ? opts.template : saved?.template && isTemplate(saved.template) ? saved.template : "hero";
  const document = buildDocumentFromConcept(c, { template, model });
  if (saved?.layout) document.layout = { ...document.layout, ...saved.layout };
  if (saved?.scene?.kind === "gradient") document.scene = saved.scene;
  if (saved?.product && document.product) document.product = { ...document.product, scale: saved.product.scale, x: saved.product.x, y: saved.product.y };

  const [creative] = await db
    .insert(creatives)
    .values({ orgId, conceptId, kind: "static", name: c.title, document: document as unknown as Record<string, unknown> })
    .returning({ id: creatives.id });

  const specs: PlacementSpec[] = STATIC_PLACEMENT_IDS.map((id) => getPlacement(id));
  await db.insert(variants).values(
    specs.map((s) => ({ orgId, creativeId: creative.id, placementId: s.id, ratio: s.ratio, width: s.width, height: s.height })),
  );
  await db.update(concepts).set({ status: "selected" }).where(and(eq(concepts.id, conceptId), eq(concepts.status, "proposed")));

  await dispatch("static.generate", { orgId, creativeId: creative.id, model });
  return { creativeId: creative.id };
}

export type DocumentPatch = Partial<Pick<StaticAdDocument, "template" | "headline" | "subhead" | "cta">> & {
  layout?: Partial<StaticAdDocument["layout"]>;
  product?: Partial<NonNullable<StaticAdDocument["product"]>>;
};

/** Merge a patch into the creative's document and re-render every size. */
export async function updateCreativeDocument(orgId: string, creativeId: string, patch: DocumentPatch): Promise<void> {
  await dbReady;
  const [row] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!row) throw new Error("Creative not found");
  const current = normalizeDocument(row.document as unknown as StaticAdDocument);
  const next: StaticAdDocument = {
    ...current,
    ...(patch.template ? { template: patch.template } : {}),
    ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
    ...(patch.subhead !== undefined ? { subhead: patch.subhead || undefined } : {}),
    ...(patch.cta !== undefined ? { cta: patch.cta } : {}),
    layout: { ...current.layout, ...(patch.layout ?? {}) },
    product: current.product ? { ...current.product, ...(patch.product ?? {}) } : current.product,
  };
  await db.update(creatives).set({ document: next as unknown as Record<string, unknown> }).where(eq(creatives.id, creativeId));
  await dispatch("render.variants", { orgId, creativeId });
}

/** Re-run the renderer for every size without touching the scene. */
export async function rerender(orgId: string, creativeId: string): Promise<void> {
  await dbReady;
  const [row] = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!row) throw new Error("Creative not found");
  await dispatch("render.variants", { orgId, creativeId });
}

/** Generate a fresh scene with the chosen model (charges STATIC_SCENE_CREDITS), then re-render. */
export async function regenerateScene(orgId: string, creativeId: string, model?: string): Promise<void> {
  await dbReady;
  const [row] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!row) throw new Error("Creative not found");
  const chosen = imageModels.some((m) => m.id === model) ? (model as string) : ((row.document as { meta?: { model?: string } }).meta?.model ?? defaultModel("image").id);
  const doc = normalizeDocument(row.document as unknown as StaticAdDocument);
  await db
    .update(creatives)
    .set({ document: { ...doc, meta: { ...(doc.meta ?? {}), model: chosen, lastError: undefined } } as unknown as Record<string, unknown> })
    .where(eq(creatives.id, creativeId));
  await dispatch("static.generate", { orgId, creativeId, model: chosen });
}
