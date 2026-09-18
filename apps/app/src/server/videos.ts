import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { listVoices } from "@adcraft/ai";
import { getPresenterGroups } from "./presenter-library";
import { getCatalog } from "./model-catalog";
import { getPlacement } from "@adcraft/specs";
import { documentDurationSec, normalizeVideoDocument, type VideoDocument, type VideoKind, type VideoRatio, type VideoScene } from "@adcraft/render/video";
import { withDefaults } from "@/lib/brand-kit";
import { CREDIT_COSTS } from "./billing";
import { dispatch } from "./jobs";
import "@/pipelines";

/**
 * Video & UGC creatives (Release 2): concept → storyboard document → creative + variants →
 * `video.generate` / `ugc.generate` jobs. Reads for the storyboard page live here too.
 */

export const VIDEO_RATIOS: Array<{ id: VideoRatio; label: string; placementId: string; hint: string }> = [
  { id: "9:16", label: "9:16", placementId: "meta.stories.9x16", hint: "Reels, Stories, TikTok, Shorts" },
  { id: "1:1", label: "1:1", placementId: "meta.feed.1x1", hint: "Feed" },
  { id: "16:9", label: "16:9", placementId: "youtube.instream.16x9", hint: "YouTube in-stream" },
];

export const MAX_SCENES = 8;
export const TARGET_SECONDS: Record<VideoKind, number> = { video: 15, ugc: 30 };
export const CREDITS: Record<VideoKind, number> = { video: CREDIT_COSTS.productVideo15s, ugc: CREDIT_COSTS.ugcVideo30s };

export type VideoStatus = "ready" | "rendering" | "failed" | "draft";

// ---------- script parsing ----------

const SCENE_PREFIX = /^\s*(?:scene|shot|beat)?\s*\d+\s*[.:)\-–—]?\s*(?:\(?\s*\d+\s*[-–—]?\s*\d*\s*s(?:ec)?\s*\)?\s*[.:)\-–—]?)?\s*/i;
const TIMECODE = /^\s*[\[(]?\s*\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\s*[\])]?\s*[.:\-–—]?\s*/;
/** Lines that describe the picture rather than what is said. */
const VISUAL_LEAD = /^(close[- ]?up|wide shot|medium shot|cut to|creator (holds|shows|picks)|product (shot|on|held|in)|shot of|b-roll|pan |zoom |overhead|split frame|macro|slow[- ]motion|end card|logo)/i;

/** Turn a script ("scene-by-scene lines") into scenes: spoken line, caption, image prompt. */
export function parseScriptToScenes(script: string, opts: { kind: VideoKind; visualDirection?: string; productName?: string | null; hook?: string }): VideoScene[] {
  const raw = script
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(script|storyboard|scenes?)\s*:?\s*$/i.test(l))
    // The composition adds its own logo end card.
    .filter((l) => !/^(?:[\[(]?[\d:\-–—s ]+[\])]?\s*[.:\-–—]?\s*)?(end card|outro|logo card)\b/i.test(l));

  const parsed = raw
    .map((line) => {
      let text = line.replace(TIMECODE, "").replace(SCENE_PREFIX, "").replace(/^[-*•]\s*/, "").trim();
      let visual: string | undefined;
      let spoken: string | undefined;
      // "Visual: ... VO: ..." style lines.
      const parts = text.split(/(?=\b(?:visual|shot|on[- ]screen|vo|voice[- ]?over|voice|caption|text)\s*:)/i);
      for (const p of parts) {
        const m = /^(visual|shot|on[- ]screen|vo|voice[- ]?over|voice|caption|text)\s*:\s*(.*)$/i.exec(p.trim());
        if (!m) continue;
        const key = m[1]!.toLowerCase();
        const val = m[2]!.trim().replace(/^["“]|["”]$/g, "");
        if (key === "visual" || key === "shot") visual = val;
        else if (key === "vo" || key.startsWith("voice") || key === "caption" || key === "text" || key === "on-screen" || key === "on screen") spoken = spoken ? `${spoken} ${val}` : val;
      }
      if (!visual && !spoken) {
        // `Hook on screen and spoken: "…"` → the quote is spoken; the label hints at the visual.
        const quoted = /^([^:"“]{2,60}):\s*["“](.+?)["”]?\s*$/.exec(text);
        // `The angle, social proof: …` → a short label followed by the line.
        const labelled = /^([A-Za-z][A-Za-z ,/-]{1,40}):\s+(.+)$/.exec(text);
        if (quoted) {
          spoken = quoted[2]!.trim();
          const label = quoted[1]!.trim();
          visual = /shot|visual|close|creator|product/i.test(label) && !/spoken|hook/i.test(label) && label.split(/\s+/).length >= 4 ? label : "";
        } else if (VISUAL_LEAD.test(text)) {
          visual = text;
        } else if (labelled && labelled[1]!.split(/\s+/).length <= 5) {
          spoken = labelled[2]!.trim().replace(/^["“]|["”]$/g, "");
        } else {
          spoken = text.replace(/^["“]|["”]$/g, "");
        }
      }
      return { spoken: (spoken ?? "").trim(), visual: (visual ?? "").trim() };
    })
    .filter((p) => p.spoken || p.visual);

  // Merge very short fragments so scenes carry a full thought; cap at MAX_SCENES by merging neighbours.
  const merged: Array<{ spoken: string; visual: string }> = [];
  for (const p of parsed) {
    const last = merged[merged.length - 1];
    if (last && p.spoken && p.spoken.split(/\s+/).length < 3 && !p.visual) last.spoken = `${last.spoken} ${p.spoken}`.trim();
    else merged.push({ ...p });
  }
  while (merged.length > MAX_SCENES) {
    let best = 0;
    for (let i = 0; i < merged.length - 1; i++) {
      if (merged[i]!.spoken.length + merged[i + 1]!.spoken.length < merged[best]!.spoken.length + merged[best + 1]!.spoken.length) best = i;
    }
    merged[best] = { spoken: `${merged[best]!.spoken} ${merged[best + 1]!.spoken}`.trim(), visual: merged[best]!.visual || merged[best + 1]!.visual };
    merged.splice(best + 1, 1);
  }
  if (merged.length === 0) merged.push({ spoken: opts.hook ?? "", visual: opts.visualDirection ?? "" });

  const n = merged.length;
  const per = Math.min(5, Math.max(2, Math.round((TARGET_SECONDS[opts.kind] / n) * 2) / 2));
  const product = opts.productName ? `${opts.productName}` : "the product";
  const hook = opts.hook && opts.hook.length <= 80 ? opts.hook.trim() : undefined;
  return merged.map((m, i) => ({
    id: `scene-${i + 1}`,
    line: m.spoken,
    // The hook is shown large over scene 1, so do not repeat it as a caption.
    caption: i === 0 && hook && m.spoken === hook ? "" : m.spoken.length > 90 ? m.spoken.slice(0, 87).replace(/\s+\S*$/, "") + "…" : m.spoken,
    prompt: `${noTextInstructions(m.visual || `${opts.visualDirection ? `${opts.visualDirection}. ` : ""}${product} in a scene that matches: "${m.spoken}".`)} Photoreal, ad-quality. No text, no letters, no typography, no logos, no captions, no graphics anywhere in the frame.`,
    durationSec: opts.kind === "ugc" ? Math.max(2, Math.round(m.spoken.split(/\s+/).length / 2.5)) : per,
    hookText: i === 0 ? hook : undefined,
    role: "scene" as const,
  }));
}

/** 1–2 product B-roll scenes for UGC cut-ins. */
export function brollScenes(visualDirection: string | undefined, productName: string | null | undefined): VideoScene[] {
  const p = productName ?? "the product";
  const base = visualDirection ? `${visualDirection}. ` : "";
  return [
    { id: "broll-1", line: "", caption: "", prompt: `${base}Close-up of a single ${p} held in one hand, natural window light, candid phone-camera look. One continuous shot: no collage, no grid, no split screen, no duplicate products. No text.`, durationSec: 3, role: "broll" },
    { id: "broll-2", line: "", caption: "", prompt: `${base}One ${p} in use on a real countertop, shallow depth of field, lifestyle. One continuous shot: no collage, no grid, no split screen. No text.`, durationSec: 3, role: "broll" },
  ];
}

// ---------- concept lookup ----------

export type ConceptForVideo = {
  id: string;
  title: string;
  kind: "static" | "video" | "ugc";
  briefId: string;
  briefTitle: string;
  data: typeof concepts.$inferSelect["data"];
  brand: { id: string; name: string; kit: BrandKitData };
  product: { id: string; name: string; cutoutKey: string | null; imageKey: string | null } | null;
  existingVideos: number;
};

export async function getConceptForVideo(orgId: string, conceptId: string): Promise<ConceptForVideo | null> {
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
  const product = row.brief.productId ? ((await db.select().from(products).where(eq(products.id, row.brief.productId)).limit(1))[0] ?? null) : null;
  const existing = await db
    .select({ id: creatives.id })
    .from(creatives)
    .where(and(eq(creatives.conceptId, conceptId), inArray(creatives.kind, ["video", "ugc"])));
  return {
    id: row.concept.id,
    title: row.concept.title,
    kind: row.concept.kind,
    briefId: row.brief.id,
    briefTitle: row.brief.title,
    data: row.concept.data,
    brand: { id: row.brand.id, name: row.brand.name, kit: withDefaults(kit?.data) },
    product: product ? { id: product.id, name: product.name, cutoutKey: product.cutoutKey, imageKey: product.imageKey } : null,
    existingVideos: existing.length,
  };
}

// ---------- document construction ----------

export type VideoOptions = {
  kind: VideoKind;
  model: string;
  ratio: VideoRatio;
  avatarId?: string;
  voiceId?: string;
  imageModel?: string;
  characterImageKey?: string;
  characterId?: string;
  motion?: { expressiveness?: "low" | "medium" | "high"; prompt?: string };
  templateId?: string;
};

export function buildVideoDocument(c: ConceptForVideo, opts: VideoOptions): VideoDocument {
  const kit = c.brand.kit;
  const script = c.data.script?.trim() || [c.data.hook, c.data.primaryText, c.data.cta].filter(Boolean).join("\n");
  const scenes = parseScriptToScenes(script, { kind: opts.kind, visualDirection: c.data.visualDirection, productName: c.product?.name, hook: c.data.hook });
  const cutoutKey = c.product?.cutoutKey ?? c.product?.imageKey ?? null;
  const logoKey = kit.logoUrl?.startsWith("/api/files/") ? kit.logoUrl.slice("/api/files/".length) : undefined;
  return normalizeVideoDocument({
    kind: opts.kind,
    model: opts.model,
    imageModel: opts.imageModel,
    ratio: opts.ratio,
    script,
    scenes: opts.kind === "ugc" ? [...scenes, ...brollScenes(c.data.visualDirection, c.product?.name)] : scenes,
    product: c.product ? { id: c.product.id, name: c.product.name, cutout: cutoutKey ? { key: cutoutKey } : undefined } : null,
    brand: {
      name: c.brand.name,
      logo: logoKey ? { key: logoKey } : kit.logoUrl ? { url: kit.logoUrl } : undefined,
      colors: { primary: kit.colors.primary, accent: kit.colors.accent ?? "#e65c32", background: kit.colors.background ?? "#f8f7f3", text: kit.colors.text ?? "#242521" },
      fonts: { heading: kit.fonts.heading, body: kit.fonts.body },
    },
    captions: { style: opts.kind === "ugc" ? "bold" : "clean", position: "bottom" },
    endCard: { headline: c.data.headline, cta: c.data.cta || "Shop now", durationSec: 2.5 },
    voice: opts.kind === "ugc" ? { voiceId: opts.voiceId ?? "" } : undefined,
    presenter:
      opts.kind === "ugc"
        ? { avatarId: opts.avatarId ?? "", ...(opts.characterImageKey ? { image: { key: opts.characterImageKey }, characterId: opts.characterId, motion: opts.motion } : {}) }
        : undefined,
    aiLabel: opts.kind === "ugc",
    meta: { conceptId: c.id, productId: c.product?.id ?? null, visualDirection: c.data.visualDirection, tone: kit.voice?.tone ?? [], templateId: opts.templateId, characterStudio: Boolean(opts.characterId || opts.templateId) },
  });
}

export async function videoModelChoices() {
  const c = await getCatalog();
  const def = c.default("video").id;
  return c.list("video").map((m) => ({
    id: m.id,
    label: m.label,
    notes: m.notes ?? "",
    isDefault: m.id === def,
    audio: Boolean(m.video?.audio),
    durations: m.video?.durationsSec ?? [],
    creditsPerSec: m.credits,
    connected: m.connected,
  }));
}

export async function presenterChoices() {
  const [library, voices] = await Promise.all([getPresenterGroups(), listVoices()]);
  return { groups: library.groups, libraryLoading: library.loading, voices };
}

// ---------- writes ----------

export async function createVideoFromConcept(orgId: string, conceptId: string, opts: Partial<VideoOptions>): Promise<{ creativeId: string }> {
  await dbReady;
  const c = await getConceptForVideo(orgId, conceptId);
  if (!c) throw new Error("Concept not found");
  const kind: VideoKind = opts.kind === "ugc" ? "ugc" : "video";
  {
    const { planAllows } = await import("./platform-settings");
    const { currentSubscription } = await import("./billing");
    const sub = await currentSubscription(orgId);
    if (!(await planAllows(sub?.plan, kind))) throw new Error(`${kind === "ugc" ? "UGC video" : "Product video"} is not enabled for this plan`);
  }
  const catalog = await getCatalog();
  const model = opts.model && catalog.get(opts.model)?.kind === "video" && catalog.get(opts.model)?.enabled !== false ? (opts.model as string) : catalog.default("video").id;
  const ratio: VideoRatio = VIDEO_RATIOS.some((r) => r.id === opts.ratio) ? (opts.ratio as VideoRatio) : "9:16";
  const document = buildVideoDocument(c, { ...opts, kind, model, ratio });

  const suffix = kind === "ugc" ? "UGC" : "Video";
  const [creative] = await db
    .insert(creatives)
    .values({ orgId, conceptId, kind, name: c.existingVideos ? `${c.title} · ${suffix} ${c.existingVideos + 1}` : `${c.title} · ${suffix}`, document: document as unknown as Record<string, unknown> })
    .returning({ id: creatives.id });

  // Primary ratio first so the storyboard's first player is the one the user chose.
  const ordered = [...VIDEO_RATIOS].sort((a, b) => (a.id === ratio ? -1 : b.id === ratio ? 1 : 0));
  const durationSec = Math.round(documentDurationSec(document));
  await db.insert(variants).values(
    ordered.map((r) => {
      const s = getPlacement(r.placementId);
      return { orgId, creativeId: creative!.id, placementId: s.id, ratio: s.ratio, width: s.width, height: s.height, durationSec };
    }),
  );
  await db.update(concepts).set({ status: "selected" }).where(and(eq(concepts.id, conceptId), eq(concepts.status, "proposed")));

  if (kind === "ugc") await dispatch("ugc.generate", { orgId, creativeId: creative!.id });
  else await dispatch("video.generate", { orgId, creativeId: creative!.id, model });
  return { creativeId: creative!.id };
}

async function loadOwned(orgId: string, creativeId: string) {
  await dbReady;
  const [row] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!row || (row.kind !== "video" && row.kind !== "ugc")) throw new Error("Video not found");
  return { row, doc: normalizeVideoDocument({ ...(row.document as Partial<VideoDocument>), kind: row.kind }) };
}

async function save(creativeId: string, doc: VideoDocument) {
  await db.update(creatives).set({ document: doc as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(creatives.id, creativeId));
}

function dispatchFor(orgId: string, creativeId: string, doc: VideoDocument) {
  return doc.kind === "ugc" ? dispatch("ugc.generate", { orgId, creativeId }) : dispatch("video.generate", { orgId, creativeId, model: doc.model });
}

/** Edit a scene's caption / hook / prompt. Caption edits re-assemble; prompt edits regenerate the scene. */
export async function updateScene(
  orgId: string,
  creativeId: string,
  sceneId: string,
  patch: { caption?: string; hookText?: string | null; prompt?: string; line?: string },
): Promise<void> {
  const { row, doc } = await loadOwned(orgId, creativeId);
  const i = doc.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error("Scene not found");
  const scene = doc.scenes[i]!;
  const promptChanged = patch.prompt !== undefined && patch.prompt.trim() !== scene.prompt;
  const lineChanged = patch.line !== undefined && patch.line.trim() !== scene.line;
  doc.scenes[i] = {
    ...scene,
    ...(patch.caption !== undefined ? { caption: patch.caption.trim() } : {}),
    ...(patch.line !== undefined ? { line: patch.line.trim() } : {}),
    ...(patch.hookText !== undefined ? { hookText: patch.hookText?.trim() || undefined } : {}),
    ...(patch.prompt !== undefined ? { prompt: patch.prompt.trim() } : {}),
    ...(promptChanged ? { still: undefined, clip: undefined } : {}),
  };
  if (lineChanged && doc.kind === "ugc") {
    if (doc.voice) doc.voice = { ...doc.voice, audio: undefined };
    if (doc.presenter) doc.presenter = { ...doc.presenter, clip: undefined };
    doc.script = doc.scenes.filter(s => s.role !== "broll").map(s => s.line).join("\n");
  }
  await save(row.id, doc);
  await dispatchFor(orgId, creativeId, doc);
}

/** Drop a scene's still + clip and run the pipeline again (only that scene is regenerated). */
export async function regenerateScene(orgId: string, creativeId: string, sceneId: string): Promise<void> {
  const { row, doc } = await loadOwned(orgId, creativeId);
  const i = doc.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error("Scene not found");
  doc.scenes[i] = { ...doc.scenes[i]!, still: undefined, clip: undefined, error: undefined };
  await save(row.id, doc);
  await dispatchFor(orgId, creativeId, doc);
}

/** Re-run the pipeline: generates whatever is missing and re-assembles every size. */
export async function rerunVideo(orgId: string, creativeId: string, opts: { model?: string; fresh?: boolean } = {}): Promise<void> {
  const { row, doc } = await loadOwned(orgId, creativeId);
  if (opts.model && (await getCatalog()).get(opts.model)?.kind === "video") doc.model = opts.model;
  if (opts.fresh) {
    doc.scenes = doc.scenes.map((s) => ({ ...s, still: undefined, clip: undefined, error: undefined }));
    doc.presenter = doc.presenter ? { ...doc.presenter, clip: undefined } : undefined;
    doc.voice = doc.voice ? { voiceId: doc.voice.voiceId } : undefined;
  }
  doc.meta = { ...(doc.meta ?? {}), lastError: undefined };
  await save(row.id, doc);
  await dispatchFor(orgId, creativeId, doc);
}

// ---------- reads ----------

export type VideoEvent = {
  id: string;
  capability: string;
  provider: string;
  model: string;
  status: string;
  label: string;
  detail: string;
  step: string;
  credits: number;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  root: boolean;
  sceneId: string | null;
};

export type VideoVariant = {
  id: string;
  placementId: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  render: { id: string; status: "queued" | "running" | "succeeded" | "failed"; url: string | null; posterUrl: string | null; fileBytes: number | null; error: string | null; createdAt: Date } | null;
};

export type VideoDetail = {
  id: string;
  name: string;
  kind: VideoKind;
  status: VideoStatus;
  document: VideoDocument;
  concept: { id: string; title: string; briefId: string };
  variants: VideoVariant[];
  events: VideoEvent[];
  running: VideoEvent | null;
  lastError: string | null;
  durationSec: number;
  credits: number;
  updatedAt: Date;
};

export const STEPS: Record<VideoKind, Array<{ id: string; label: string }>> = {
  video: [
    { id: "stills", label: "Scene stills" },
    { id: "clips", label: "Image to video" },
    { id: "assemble", label: "Assemble sizes" },
  ],
  ugc: [
    { id: "voice", label: "Voice-over" },
    { id: "presenter", label: "Presenter" },
    { id: "broll", label: "B-roll" },
    { id: "assemble", label: "Assemble sizes" },
  ],
};

export async function getVideo(orgId: string, creativeId: string): Promise<VideoDetail | null> {
  await dbReady;
  const [row] = await db
    .select({ creative: creatives, concept: concepts })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId)))
    .limit(1);
  if (!row || (row.creative.kind !== "video" && row.creative.kind !== "ugc")) return null;
  const kind = row.creative.kind;
  const doc = normalizeVideoDocument({ ...(row.creative.document as Partial<VideoDocument>), kind });

  const [vs, rs, evs] = await Promise.all([
    db.select().from(variants).where(eq(variants.creativeId, creativeId)).orderBy(variants.createdAt),
    db.select({ r: renders }).from(renders).innerJoin(variants, eq(variants.id, renders.variantId)).where(eq(variants.creativeId, creativeId)),
    db.select().from(generationEvents).where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.creativeId, creativeId))).orderBy(desc(generationEvents.createdAt)).limit(60),
  ]);

  const latest = new Map<string, typeof renders.$inferSelect>();
  for (const { r } of rs) {
    const prev = latest.get(r.variantId);
    if (!prev || r.createdAt > prev.createdAt) latest.set(r.variantId, r);
  }

  const events: VideoEvent[] = evs.map((e) => ({
    id: e.id,
    capability: e.capability,
    provider: e.provider,
    model: e.model,
    status: e.status,
    label: (e.meta?.label as string | undefined) ?? `${e.capability} · ${e.model}`,
    detail: (e.meta?.detail as string | undefined) ?? "",
    step: (e.meta?.step as string | undefined) ?? "",
    credits: e.credits,
    error: e.error,
    durationMs: e.durationMs,
    createdAt: e.createdAt,
    root: Boolean(e.meta?.root),
    sceneId: (e.meta?.sceneId as string | undefined) ?? null,
  }));
  const running = events.find((e) => e.root && e.status === "started") ?? events.find((e) => e.status === "started") ?? null;
  const lastRoot = events.find((e) => e.root) ?? null;

  const variantRows: VideoVariant[] = vs.map((v) => {
    const r = latest.get(v.id);
    let label = v.placementId;
    try {
      label = getPlacement(v.placementId).label;
    } catch {
      /* keep id */
    }
    return {
      id: v.id,
      placementId: v.placementId,
      label,
      ratio: v.ratio,
      width: v.width,
      height: v.height,
      render: r
        ? {
            id: r.id,
            status: r.status,
            url: r.outputKey ? `/api/files/${r.outputKey}` : null,
            posterUrl: typeof (r.meta as Record<string, unknown> | null)?.posterKey === "string" ? `/api/files/${(r.meta as Record<string, unknown>).posterKey as string}` : null,
            fileBytes: r.fileBytes,
            error: r.error,
            createdAt: r.createdAt,
          }
        : null,
    };
  });

  const anyReady = variantRows.some((v) => v.render?.status === "succeeded");
  const status: VideoStatus = running
    ? "rendering"
    : lastRoot?.status === "failed" || (variantRows.some((v) => v.render?.status === "failed") && !anyReady)
      ? "failed"
      : anyReady
        ? "ready"
        : "draft";

  const renderError = variantRows.find((v) => v.render?.status === "failed")?.render?.error ?? null;
  return {
    id: row.creative.id,
    name: row.creative.name,
    kind,
    status,
    document: doc,
    concept: { id: row.concept.id, title: row.concept.title, briefId: row.concept.briefId },
    variants: variantRows,
    events,
    running,
    lastError: (lastRoot?.status === "failed" ? lastRoot.error : null) ?? (doc.meta?.lastError as string | undefined) ?? renderError,
    durationSec: Math.round(documentDurationSec(doc)),
    credits: CREDITS[kind],
    updatedAt: row.creative.updatedAt,
  };
}

/** Drop sentences that instruct on-screen text or graphics: captions are composited by the video renderer, not painted by the image model. */
function noTextInstructions(visual: string): string {
  const kept = visual
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => !/\b(on-screen|text|headline|logo|typograph|graphic|caption|stamp|badge|subtitle|overlay)\b/i.test(sentence))
    .join(" ")
    .trim();
  return kept || visual;
}
