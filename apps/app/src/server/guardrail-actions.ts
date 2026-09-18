"use server";
import { redirect } from "next/navigation";
import { requireOrg } from "./org";
import { setOrgSettings } from "./platform-settings";
import { logAudit } from "./audit";

/** Settings → Guardrails form (owners only). Empty = platform default; 0 = rule off. */
export async function saveGuardrails(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/guardrails");
  const num = (k: string): number | null | undefined => {
    const raw = String(formData.get(k) ?? "").trim();
    if (raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n === 0 ? null : Math.round(n);
  };
  const spend = num("spendApprovalAbove");
  const cap = num("monthlyCreditCap");
  await setOrgSettings(ctx.org.id, {
    spendApprovalAbove: spend,
    monthlyCreditCap: cap === undefined ? null : cap,
    notifyOnFinish: formData.get("notifyOnFinish") === "on",
    approvalBeforePublish: formData.get("approvalBeforePublish") === "on",
  });
  await logAudit(ctx.org.id, ctx.viewer.userId, "settings.guardrails", "organization", ctx.org.id, { spendApprovalAbove: spend, monthlyCreditCap: cap });
  redirect("/settings/guardrails?ok=1");
}
