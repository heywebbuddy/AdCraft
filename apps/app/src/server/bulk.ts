"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, dbReady, concepts } from "@adcraft/db";
import { requireOrg } from "./org";
import { logAudit } from "./audit";

type CreateFromConcept = (orgId: string, conceptId: string, opts: { model?: string; template?: string }) => Promise<{ creativeId: string }>;

/**
 * The creation entry point lives in `./creatives` (owned by the studio work). It is loaded
 * lazily so this page still typechecks and renders if that export is renamed or missing.
 */
async function loadCreateFromConcept(): Promise<CreateFromConcept | null> {
  try {
    const mod = (await import("./creatives")) as Record<string, unknown>;
    const fn = mod.createCreativeFromConcept;
    return typeof fn === "function" ? (fn as CreateFromConcept) : null;
  } catch (err) {
    console.error("[bulk] creatives module unavailable", err);
    return null;
  }
}

/** /briefs/bulk submit: selected concepts × templates → one creative each, all sizes. */
export async function bulkGenerate(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") redirect("/briefs/bulk?error=role");
  await dbReady;
  const conceptIds = formData.getAll("conceptIds").map(String).filter(Boolean);
  const templates = formData.getAll("templates").map(String).filter(Boolean);
  const model = String(formData.get("model") ?? "").trim() || undefined;
  if (conceptIds.length === 0) redirect("/briefs/bulk?error=concepts");
  if (templates.length === 0) redirect("/briefs/bulk?error=templates");

  const create = await loadCreateFromConcept();
  if (!create) redirect("/briefs/bulk?error=unavailable");

  // Only concepts of this org (and, when a brand is selected, of that brand's briefs).
  const owned = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.orgId, ctx.org.id), inArray(concepts.id, conceptIds)));
  const ids = owned.map((c) => c.id);

  let queued = 0;
  const failures: string[] = [];
  for (const conceptId of ids) {
    for (const template of templates) {
      try {
        await create(ctx.org.id, conceptId, { model, template });
        queued += 1;
      } catch (err) {
        failures.push(`${conceptId.slice(0, 8)}/${template}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await logAudit(ctx.org.id, ctx.viewer.userId, "bulk.generated", "brand", ctx.brand?.id ?? null, {
    count: queued,
    concepts: ids.length,
    templates,
    model: model ?? null,
    failures: failures.slice(0, 10),
  });
  redirect(`/briefs/bulk?queued=${queued}${failures.length ? `&failed=${failures.length}` : ""}`);
}
