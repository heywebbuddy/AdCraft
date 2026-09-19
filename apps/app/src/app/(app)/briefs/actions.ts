"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { GuardrailError, checkRate } from "@/server/guardrails";
import { revalidatePath } from "next/cache";
import { db, dbReady, brandKits, briefs, concepts, products, projects } from "@adcraft/db";
import { generateBriefAssistWith, type BriefAssist, type BriefField } from "@adcraft/ai";
import { requireOrg } from "@/server/org";
import { getCatalog } from "@/server/model-catalog";
import {
  DEFAULT_CONCEPT_COUNT,
  FORMATS,
  MORE_CONCEPT_COUNT,
  OBJECTIVES,
  PLATFORMS,
  startConceptsRun,
  type FormatId,
  type Objective,
  type StoredBriefData,
} from "@/server/briefs";

function multi(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `/briefs/new` submit: creates a project + brief, records the event, dispatches generation. */
export async function createBrief(formData: FormData) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  await dbReady;

  const title = String(formData.get("title") ?? "").trim();
  const objective = String(formData.get("objective") ?? "").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const offer = String(formData.get("offer") ?? "").trim();
  const tone = String(formData.get("tone") ?? "").trim();
  const constraints = String(formData.get("constraints") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim() || null;
  const platforms = multi(formData, "platforms").filter((p) => PLATFORMS.some((x) => x.id === p));
  const formats = multi(formData, "formats").filter((f): f is FormatId => FORMATS.some((x) => x.id === f));

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!OBJECTIVES.some((o) => o.id === objective)) missing.push("objective");
  if (!audience) missing.push("audience");
  if (platforms.length === 0) missing.push("platforms");
  if (formats.length === 0) missing.push("formats");
  if (missing.length) redirect(`/briefs/new?error=${encodeURIComponent(missing.join(","))}`);

  if (productId) {
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.brandId, ctx.brand.id)))
      .limit(1);
    if (!p) redirect(`/briefs/new?error=product`);
  }

  const data: StoredBriefData = {
    objective: objective as Objective,
    audience,
    offer: offer || undefined,
    platforms,
    formats,
    constraints: constraints ? lines(constraints) : undefined,
    tone: tone || undefined,
  };

  const [project] = await db
    .insert(projects)
    .values({ orgId: ctx.org.id, brandId: ctx.brand.id, name: title })
    .returning();
  const [brief] = await db
    .insert(briefs)
    .values({ orgId: ctx.org.id, projectId: project.id, productId, title, data })
    .returning();

  try {
    await startConceptsRun({
      orgId: ctx.org.id,
      userId: ctx.viewer.userId,
      briefId: brief.id,
      title,
      count: DEFAULT_CONCEPT_COUNT,
    });
  } catch (err) {
    if (err instanceof GuardrailError) redirect(`/briefs/${brief.id}?guardrail=${encodeURIComponent(err.message)}`);
    throw err;
  }

  redirect(`/briefs/${brief.id}`);
}

/** "Generate more" on the brief page: another run with a smaller count. */
export async function generateMoreConcepts(briefId: string) {
  const ctx = await requireOrg();
  await dbReady;
  const [brief] = await db
    .select({ id: briefs.id, title: briefs.title })
    .from(briefs)
    .where(and(eq(briefs.id, briefId), eq(briefs.orgId, ctx.org.id)))
    .limit(1);
  if (!brief) throw new Error("Brief not found");

  await startConceptsRun({
    orgId: ctx.org.id,
    userId: ctx.viewer.userId,
    briefId: brief.id,
    title: brief.title,
    count: MORE_CONCEPT_COUNT,
  });
  revalidatePath(`/briefs/${briefId}`);
}

export type BriefDraftInput = {
  title: string;
  productId: string;
  objective: string;
  audience: string;
  offer: string;
  platforms: string[];
  formats: string[];
  tone: string;
  constraints: string;
};

export type SuggestBriefResult =
  | { ok: true; draft: BriefAssist; applied: BriefField }
  | { ok: false; error: string };

function sanitizeAssist(raw: BriefAssist, productIds: Set<string>): BriefAssist {
  const platforms = raw.platforms.filter((p) => PLATFORMS.some((x) => x.id === p));
  const formats = raw.formats.filter((f): f is FormatId => FORMATS.some((x) => x.id === f));
  return {
    ...raw,
    title: raw.title.trim(),
    productId: raw.productId && productIds.has(raw.productId) ? raw.productId : "",
    audience: raw.audience.trim(),
    offer: raw.offer.trim(),
    platforms: platforms.length ? platforms : ["meta", "instagram"],
    formats: formats.length ? formats : ["static"],
    tone: raw.tone.trim(),
    constraints: raw.constraints.map((s) => s.trim()).filter(Boolean),
    note: raw.note.trim(),
  };
}

/**
 * Cloud write-or-rewrite for the new-brief form. Does not spend a concept credit.
 * Empty fields are filled from the brand kit; weak or random text is rewritten.
 */
export async function suggestBriefFields(input: {
  scope: BriefField;
  draft: BriefDraftInput;
}): Promise<SuggestBriefResult> {
  const ctx = await requireOrg();
  if (!ctx.brand) return { ok: false, error: "Add a brand first." };
  try {
    checkRate(ctx.org.id, "brief-assist", 20);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Too many suggestions. Wait a moment." };
  }

  await dbReady;
  await getCatalog();

  const [kit] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.brandId, ctx.brand.id), eq(brandKits.isActive, true)))
    .orderBy(desc(brandKits.version))
    .limit(1);
  const catalog = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
    })
    .from(products)
    .where(and(eq(products.orgId, ctx.org.id), eq(products.brandId, ctx.brand.id)));

  try {
    const result = await generateBriefAssistWith({
      scope: input.scope,
      brand: {
        name: ctx.brand.name,
        industry: ctx.brand.industry ?? undefined,
        website: ctx.brand.website ?? undefined,
        tone: kit?.data.voice?.tone,
        doSay: kit?.data.voice?.doSay,
        dontSay: kit?.data.voice?.dontSay,
        tagline: kit?.data.tagline,
      },
      products: catalog.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        price: p.price ?? undefined,
      })),
      draft: input.draft,
    });
    return {
      ok: true,
      draft: sanitizeAssist(result.output, new Set(catalog.map((p) => p.id))),
      applied: input.scope,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach the writing model.";
    return { ok: false, error: message.slice(0, 180) };
  }
}

export async function setConceptStatus(conceptId: string, status: "proposed" | "selected" | "rejected") {
  const ctx = await requireOrg();
  await dbReady;
  const [row] = await db
    .update(concepts)
    .set({ status })
    .where(and(eq(concepts.id, conceptId), eq(concepts.orgId, ctx.org.id)))
    .returning({ briefId: concepts.briefId });
  if (!row) throw new Error("Concept not found");
  revalidatePath(`/briefs/${row.briefId}`);
}
