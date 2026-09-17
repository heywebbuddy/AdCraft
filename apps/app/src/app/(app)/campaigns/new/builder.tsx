"use client";

import { useMemo, useState } from "react";
import { Spark } from "@/components/spark";
import { useFormStatus } from "react-dom";
import type { Platform, ValidationIssue } from "@adcraft/ads";
import type { PublishableCreative } from "@/server/ads";
import { createCampaignAction } from "@/server/ads-actions";
import { Field, PlatformMark, StatusChip, chipClass, fieldClass, money } from "../ui";

export type BuilderPlacement = { id: string; platform: Platform; label: string; ratio: string; media: string[]; specPlatform: string };
type Account = { id: string; platform: Platform; name: string; currency: string; sandbox: boolean };
type Objective = { id: string; label: string; hint: string };

const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["SE", "Sweden"],
  ["IE", "Ireland"],
  ["IN", "India"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
  ["JP", "Japan"],
  ["NZ", "New Zealand"],
];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "SGD", "AED", "BRL", "MXN", "JPY"];

function SubmitButtons({ disabled, sandbox }: { disabled: boolean; sandbox: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-2">
      <button type="submit" name="mode" value="paused" disabled={disabled || pending} className="btn btn-dark h-11 disabled:cursor-not-allowed disabled:opacity-40">
        {pending ? <><Spark size={14} animate="spin" /> Publishing…</> : "Publish as paused"}
      </button>
      <button type="submit" name="mode" value="active" disabled={disabled || pending} className="btn btn-orange h-11 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
        {pending ? <><Spark size={14} animate="spin" /> Publishing…</> : "Publish active"}
      </button>
      <span className="text-[11px] text-muted">
        {sandbox ? "Sandbox account: nothing leaves Adcraft, but every step runs for real." : "Paused campaigns are created on the platform without spend; switch them on from the campaign page."}
      </span>
    </div>
  );
}

function Issues({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return <span className="text-[11px] text-[#3f7a55]">Passes spec check</span>;
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {issues.map((i, k) => (
        <li key={k} className={`flex items-start gap-1.5 text-[11px] ${i.level === "error" ? "text-[#b4382a]" : "text-[#b7791f]"}`}>
          <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function CampaignBuilder(props: {
  accounts: Account[];
  placements: BuilderPlacement[];
  creatives: PublishableCreative[];
  objectives: Objective[];
  brandName: string;
  brandWebsite: string;
  initialAccountId: string | null;
}) {
  const first = props.accounts.find((a) => a.id === props.initialAccountId) ?? props.accounts[0]!;
  const [accountId, setAccountId] = useState(first.id);
  const account = props.accounts.find((a) => a.id === accountId) ?? first;
  const platformPlacements = useMemo(() => props.placements.filter((p) => p.platform === account.platform), [props.placements, account.platform]);
  const [placementIds, setPlacementIds] = useState<string[]>(() => platformPlacements.map((p) => p.id));
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [objective, setObjective] = useState(props.objectives[1]?.id ?? "traffic");
  const [budget, setBudget] = useState("25");
  const [currency, setCurrency] = useState(account.currency);
  const [landingUrl, setLandingUrl] = useState(props.brandWebsite);
  const landingOk = /^https?:\/\/\S+$/i.test(landingUrl);

  function pickAccount(id: string) {
    const next = props.accounts.find((a) => a.id === id);
    if (!next) return;
    setAccountId(id);
    setCurrency(next.currency);
    if (next.platform !== account.platform) {
      setPlacementIds(props.placements.filter((p) => p.platform === next.platform).map((p) => p.id));
      setVariantIds([]);
    }
  }

  function togglePlacement(id: string) {
    setPlacementIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      setVariantIds((vs) =>
        vs.filter((v) => {
          const variant = props.creatives.flatMap((c) => c.variants).find((x) => x.variantId === v);
          return variant && next.includes(variant.placementId);
        }),
      );
      return next;
    });
  }

  // A campaign-level landing page fills in for creatives that have none (the server re-validates with it).
  const matching = useMemo(
    () =>
      props.creatives
        .map((c) => ({
          ...c,
          copy: { ...c.copy, landingUrl: c.copy.landingUrl || (landingOk ? landingUrl : "") },
          variants: c.variants
            .filter((v) => placementIds.includes(v.placementId))
            .map((v) => (landingOk && !c.copy.landingUrl ? { ...v, issues: v.issues.filter((i) => i.code !== "landing_url") } : v)),
        }))
        .filter((c) => c.variants.length > 0),
    [props.creatives, placementIds, landingUrl, landingOk],
  );
  const allValid = matching.flatMap((c) => c.variants).filter((v) => !v.issues.some((i) => i.level === "error"));
  const chosen = matching.flatMap((c) => c.variants).filter((v) => variantIds.includes(v.variantId));
  const warnings = chosen.reduce((n, v) => n + v.issues.filter((i) => i.level === "warning").length, 0);
  const dailyMinor = Math.round((Number(budget) || 0) * 100);

  return (
    <form action={createCampaignAction} className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* 1. Where */}
        <section className="panel flex flex-col gap-6 p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Ad account" hint="Meta covers Instagram · Google covers YouTube">
              <select name="adAccountId" value={accountId} onChange={(e) => pickAccount(e.target.value)} className={`${fieldClass} h-11`}>
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.sandbox ? "Sandbox · " : ""}
                    {a.platform === "meta" ? "Meta" : a.platform === "tiktok" ? "TikTok" : "Google"} — {a.name} ({a.currency})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <PlatformMark platform={account.platform} sandbox={account.sandbox} />
              </div>
            </Field>
            <Field label="Campaign name">
              <input name="name" required placeholder="Q4 launch · Everyday Serum" className={`${fieldClass} h-11`} />
            </Field>
          </div>

          <Field label="Landing page" hint="Used for creatives without a product or brand URL">
            <input name="landingUrl" type="url" value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://yourbrand.com/serum" className={`${fieldClass} h-11`} />
          </Field>

          <Field label="Objective">
            <div className="flex flex-wrap gap-2">
              {props.objectives.map((o) => (
                <label key={o.id} className={chipClass} title={o.hint}>
                  <input type="radio" name="objective" value={o.id} checked={objective === o.id} onChange={() => setObjective(o.id)} className="sr-only" />
                  {o.label}
                </label>
              ))}
            </div>
          </Field>

          {account.platform === "meta" && !account.sandbox ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Facebook Page id" hint="Required for link ads">
                <input name="pageId" placeholder="1234567890" className={`${fieldClass} h-11`} />
              </Field>
              <Field label="Pixel id" hint="Optional · enables conversion optimisation">
                <input name="pixelId" placeholder="Meta pixel id" className={`${fieldClass} h-11`} />
              </Field>
            </div>
          ) : account.platform === "tiktok" && !account.sandbox ? (
            <Field label="Pixel id" hint="Optional · enables conversion optimisation">
              <input name="pixelId" placeholder="TikTok pixel id" className={`${fieldClass} h-11`} />
            </Field>
          ) : null}
        </section>

        {/* 2. Who */}
        <section className="panel flex flex-col gap-6 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[20px] font-medium tracking-[-0.6px]">
              Audience <span className="font-serif italic text-muted">who sees it</span>
            </h2>
          </div>
          <Field label="Countries" hint="Pick one or more">
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(([code, label]) => (
                <label key={code} className={chipClass} title={label}>
                  <input type="checkbox" name="countries" value={code} defaultChecked={code === "US"} className="sr-only" />
                  {code}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-6 md:grid-cols-3">
            <Field label="Age range">
              <div className="flex items-center gap-2">
                <input name="ageMin" type="number" min={13} max={100} defaultValue={18} className={`${fieldClass} h-11 tabular`} />
                <span className="text-muted">–</span>
                <input name="ageMax" type="number" min={13} max={100} defaultValue={65} className={`${fieldClass} h-11 tabular`} />
              </div>
            </Field>
            <Field label="Genders" hint="None checked = everyone">
              <div className="flex gap-2">
                {(["female", "male"] as const).map((g) => (
                  <label key={g} className={chipClass}>
                    <input type="checkbox" name="genders" value={g} className="sr-only" />
                    {g === "female" ? "Women" : "Men"}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Interests" hint="Comma separated · best effort">
              <input name="interests" placeholder="skincare, clean beauty" className={`${fieldClass} h-11`} />
            </Field>
          </div>
        </section>

        {/* 3. Where on the platform */}
        <section className="panel flex flex-col gap-6 p-6">
          <h2 className="m-0 text-[20px] font-medium tracking-[-0.6px]">
            Placements <span className="font-serif italic text-muted">and budget</span>
          </h2>
          <Field label="Placements" hint={`${placementIds.length} of ${platformPlacements.length}`}>
            <div className="flex flex-wrap gap-2">
              {platformPlacements.map((p) => (
                <label key={p.id} className={chipClass} title={`${p.ratio} · ${p.media.join(" / ")}`}>
                  <input type="checkbox" name="placements" value={p.id} checked={placementIds.includes(p.id)} onChange={() => togglePlacement(p.id)} className="sr-only" />
                  {p.label} <span className="ml-1.5 text-[11px] opacity-70">{p.ratio}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-6 md:grid-cols-3">
            <Field label="Daily budget">
              <div className="flex gap-2">
                <input name="dailyBudget" type="number" min={1} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${fieldClass} h-11 tabular`} />
                <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${fieldClass} h-11 w-[96px]`}>
                  {[...new Set([account.currency, ...CURRENCIES])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Start" hint="Blank = now">
              <input name="startAt" type="datetime-local" className={`${fieldClass} h-11`} />
            </Field>
            <Field label="End" hint="Optional">
              <input name="endAt" type="datetime-local" className={`${fieldClass} h-11`} />
            </Field>
          </div>
        </section>

        {/* 4. What */}
        <section className="panel flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="m-0 text-[20px] font-medium tracking-[-0.6px]">
              Creatives <span className="font-serif italic text-muted">finished renders that fit the placements</span>
            </h2>
            <div className="flex items-center gap-3 text-[12px]">
              <button type="button" onClick={() => setVariantIds(allValid.map((v) => v.variantId))} className="font-semibold text-orange">
                Select all valid ({allValid.length})
              </button>
              <button type="button" onClick={() => setVariantIds([])} className="text-muted hover:text-ink">
                Clear
              </button>
            </div>
          </div>

          {matching.length === 0 ? (
            <div className="rounded-[7px] border border-dashed border-line p-5 text-[13px] text-muted">
              No finished creative matches {placementIds.length ? "these placements" : "— pick a placement first"}. Render a creative in one of the chosen sizes and it appears here.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {matching.map((c) => (
                <div key={c.id} className="rounded-[9px] border border-line">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                    <span className="text-[13px] font-semibold">{c.name}</span>
                    <span className="truncate text-[11px] text-muted">
                      “{c.copy.headline || "No headline"}” · {c.copy.cta} · {c.copy.landingUrl || "no landing URL"}
                    </span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {c.variants.map((v) => {
                      const hard = v.issues.some((i) => i.level === "error");
                      const on = variantIds.includes(v.variantId);
                      return (
                        <label
                          key={v.variantId}
                          className={`flex cursor-pointer gap-3 rounded-[7px] border p-2.5 transition-colors ${on ? "border-ink bg-paper" : "border-line hover:border-[#c9c8c0]"} ${hard ? "cursor-not-allowed opacity-70" : ""}`}
                        >
                          <input
                            type="checkbox"
                            name="variants"
                            value={v.variantId}
                            disabled={hard}
                            checked={on}
                            onChange={() => setVariantIds((cur) => (cur.includes(v.variantId) ? cur.filter((x) => x !== v.variantId) : [...cur, v.variantId]))}
                            className="sr-only"
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.previewUrl} alt="" className="h-[84px] w-[64px] shrink-0 rounded-[5px] border border-line object-cover" />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[12px] font-semibold">{v.placementLabel}</span>
                              <span className="text-[11px] text-muted">{v.ratio}</span>
                            </div>
                            <span className="text-[11px] text-muted">
                              {v.width}×{v.height} · {(v.fileBytes / 1024).toFixed(0)} KB
                            </span>
                            <Issues issues={v.issues} />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Summary */}
      <aside className="side-sticky flex flex-col gap-4">
        <section className="panel flex flex-col gap-3 p-5">
          <span className="eyebrow">Summary</span>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-muted">Account</dt>
            <dd className="m-0 truncate font-semibold">{account.name}</dd>
            <dt className="text-muted">Objective</dt>
            <dd className="m-0 font-semibold">{props.objectives.find((o) => o.id === objective)?.label}</dd>
            <dt className="text-muted">Placements</dt>
            <dd className="m-0 font-semibold">{placementIds.length}</dd>
            <dt className="text-muted">Ads</dt>
            <dd className="m-0 font-semibold">
              {chosen.length}
              {warnings ? <span className="ml-1.5 font-normal text-[#b7791f]">{warnings} warning{warnings === 1 ? "" : "s"}</span> : null}
            </dd>
            <dt className="text-muted">Daily budget</dt>
            <dd className="tabular m-0 font-semibold">{money(dailyMinor, currency)}</dd>
            <dt className="text-muted">Advertiser</dt>
            <dd className="m-0 truncate font-semibold">{props.brandName}</dd>
          </dl>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <StatusChip status={chosen.length ? "connected" : "unknown"} label={chosen.length ? "Ready to publish" : "Pick creatives"} />
          </div>
        </section>
        <section className="panel p-5">
          <SubmitButtons disabled={chosen.length === 0} sandbox={account.sandbox} />
        </section>
        <p className="m-0 px-1 text-[11px] text-muted">
          Adcraft stores every platform id it creates and never duplicates on retry. Ad spend is billed by the platform to your own account.
        </p>
      </aside>
    </form>
  );
}
