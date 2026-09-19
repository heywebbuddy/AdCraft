"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, organizations } from "@adcraft/db";
import { requireOrg } from "./org";
import { logAudit } from "./audit";
import { sendEmail } from "./notify";
import { LEGAL_CONTACT } from "@/lib/legal";

const PRIVACY = process.env.PRIVACY_EMAIL?.trim() || LEGAL_CONTACT.privacy;

export async function requestWorkspaceDeletion(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/privacy?error=owner");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== ctx.org.name) redirect("/settings/privacy?error=name");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const at = new Date().toISOString();
  await db
    .update(organizations)
    .set({
      settings: {
        ...(ctx.org.settings ?? {}),
        deletionRequestedAt: at,
        deletionReason: reason || undefined,
      },
    })
    .where(eq(organizations.id, ctx.org.id));
  await logAudit(ctx.org.id, ctx.viewer.userId, "privacy.deletion_requested", "organization", ctx.org.id, {
    reason: reason || null,
    email: ctx.viewer.email,
  });
  await sendEmail(
    [PRIVACY, ctx.viewer.email].filter((e, i, a) => e && a.indexOf(e) === i),
    `Deletion request: ${ctx.org.name}`,
    {
      preview: `${ctx.viewer.email} asked to delete ${ctx.org.name}.`,
      kicker: "Privacy",
      title: "Workspace deletion requested",
      paragraphs: [
        `${ctx.viewer.name} (${ctx.viewer.email}) asked to delete the workspace “${ctx.org.name}”.`,
        reason ? `They wrote: ${reason}` : "They did not add a note.",
        "Confirm the owner, export anything support still needs, then delete the org row (cascades memberships) and the org/ prefix in object storage.",
      ],
    },
  );
  redirect("/settings/privacy?ok=1");
}
