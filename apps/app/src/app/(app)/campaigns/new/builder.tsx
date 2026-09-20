"use client";

import { useMemo, useState } from "react";
import { Spark } from "@/components/spark";
import { StepFooter, StepNav, StepPanel } from "@/components/stepper";
import { useFormStatus } from "react-dom";
import type { Platform, ValidationIssue } from "@adcraft/ads";
import type { PublishableCreative } from "@/server/ads";
import { createCampaignAction } from "@/server/ads-actions";
import { Field, Notice, PlatformMark, chipClass, fieldClass, money } from "../ui";

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

function SubmitButtons({ disabled, sandbox, needsApproval }: { disabled: boolean; sandbox: boolean; needsApproval: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" name="mode" value="paused" disabled={disabled || pending} className="btn btn-dark h-11 disabled:cursor-not-allowed disabled:opacity-40">
        {pending ? <><Spark size={14} animate="spin" /> Publishing…</> : "Publish as paused"}
      </button>
      <button type="submit" name="mode" value="active" disabled={disabled || pending || needsApproval} title={needsApproval ? "Above the daily-spend limit an owner must switch the campaign on" : undefined} className="btn btn-orange h-11 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
        {pending ? <><Spark size={14} animate="spin" /> Publishing…</> : "Publish active"}
      </button>
      <span className="basis-full text-[11px] text-muted">
        {sandbox ? "Sandbox account: nothing leaves Adcraft, but every step runs for real and the numbers you will see are simulated." : needsApproval ? "Publish as paused; an owner can switch it on from the campaign page." : "Paused campaigns are created on the platform without spend; switch them on from the campaign page."}
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
  /** Arriving from a creative: preselect its valid sizes and open the Creatives step. */
  initialCreativeId: string | null;
  /** Daily budget (major units) above which only an owner may publish active. */
  spendApprovalAbove: number | null;
  isOwner: boolean;
  /** Pages each connected account can publish from, keyed by account id. */
  pagesByAccount: Record<string, Array<{ id: string; name: string; category?: string }>>;
}) {
  const first = props.accounts.find((a) => a.id === props.initialAccountId) ?? props.accounts[0]!;
  const [accountId, setAccountId] = useState(first.id);
  const account = props.accounts.find((a) => a.id === accountId) ?? first;
  const pages = props.pagesByAccount[account.id] ?? [];
  const platformPlacements = useMemo(() => props.placements.filter((p) => p.platform === account.platform), [props.placements, account.platform]);
  const [placementIds, setPlacementIds] = useState<string[]>(() => platformPlacements.map((p) => p.id));
  const seed = props.initialCreativeId ? props.creatives.find((c) => c.id === props.initialCreativeId) : null;
  const [variantIds, setVariantIds] = useState<string[]>(() => (seed ? seed.variants.filter((v) => !v.issues.some((i) => i.level === "error") && platformPlacements.some((p) => p.id === v.placementId)).map((v) => v.variantId) : []));
  const [objective, setObjective] = useState(props.objectives[1]?.id ?? "traffic");
  const [budget, setBudget] = useState("25");
  const [currency, setCurrency] = useState(account.currency);
  const [landingUrl, setLandingUrl] = useState(props.brandWebsite);
  const [name, setName] = useState(seed ? `${seed.name} · ${new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : "");
  const [step, setStep] = useState(seed ? 3 : 0);
  const [countries, setCountries] = useState<string[]>(["US"]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [genders, setGenders] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const countriesSummary = countries.length ? countries.join(", ") : "US";
  const ageSummary = `${ageMin}–${ageMax}`;
  const gendersSummary = genders.length === 0 ? "" : genders.map((g) => (g === "female" ? "women" : "men")).join(" and ");
  const scheduleSummary = startAt || endAt ? ` · ${startAt ? new Date(startAt).toLocaleDateString() : "now"} → ${endAt ? new Date(endAt).toLocaleDateString() : "ongoing"}` : "";
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
  const needsApproval = props.spendApprovalAbove !== null && !props.isOwner && (Number(budget) || 0) > props.spendApprovalAbove;
  const objectiveLabel = props.objectives.find((o) => o.id === objective)?.label ?? objective;
  const platformName = account.platform === "meta" ? "Meta" : account.platform === "tiktok" ? "TikTok" : "Google";

  const step1Error = !name.trim() ? "Give the campaign a name" : landingUrl && !landingOk ? "Landing page must be a full URL" : null;
  const step3Error = placementIds.length === 0 ? "Pick at least one placement" : !(Number(budget) > 0) ? "Set a daily budget" : null;
  const step4Error = chosen.length === 0 ? "Pick at least one creative" : null;
  const steps = [
    { id: "where", title: "Account & objective", summary: `${platformName} · ${objectiveLabel}${name ? ` · ${name}` : ""}`, done: !step1Error, error: step > 0 ? step1Error : null },
    { id: "who", title: "Audience", summary: "Countries, age, interests", done: step > 1 },
    { id: "budget", title: "Placements & budget", summary: `${placementIds.length} placement${placementIds.length === 1 ? "" : "s"} · ${money(dailyMinor, currency)} / day`, done: !step3Error && step > 2, error: step > 2 ? step3Error : null },
    { id: "what", title: "Creatives", summary: chosen.length ? `${chosen.length} ad${chosen.length === 1 ? "" : "s"}${warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}` : `${allValid.length} available`, done: !step4Error, error: step > 3 ? step4Error : null },
    { id: "review", title: "Review & publish", summary: chosen.length ? "Check, then publish" : undefined, done: false },
  ];
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <form action={createCampaignAction} className="stp-layout">
      <StepNav steps={steps} current={step} onSelect={setStep} />
      <div className="flex min-w-0 flex-col gap-4">
        <StepPanel active={step === 0} title="Where does it run?" lede="The ad account decides the platform and the placements you can use.">
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
              <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 launch · Everyday Serum" className={`${fieldClass} h-11`} />
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
              <Field label="Facebook Page" hint="Ads run from this Page">
                {pages.length ? (
                  <select name="pageId" defaultValue={pages[0]!.id} className={`${fieldClass} h-11`}>
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.category ? ` · ${p.category}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="pageId" placeholder="1234567890" className={`${fieldClass} h-11`} />
                )}
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
        <StepFooter index={0} count={steps.length} onBack={back} onNext={next} nextDisabled={Boolean(step1Error)} note={step1Error ?? "Next: who sees it"} />
        </StepPanel>

        <StepPanel active={step === 1} title="Who sees it?" lede="Keep it broad on a first run; the platform's delivery does the narrowing.">
        <section className="panel flex flex-col gap-6 p-6">
          <Field label="Countries" hint="Pick one or more">
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(([code, label]) => (
                <label key={code} className={chipClass} title={label}>
                  <input type="checkbox" name="countries" value={code} checked={countries.includes(code)} onChange={() => setCountries((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]))} className="sr-only" />
                  {code}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-6 md:grid-cols-3">
            <Field label="Age range">
              <div className="flex items-center gap-2">
                <input name="ageMin" type="number" min={13} max={100} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className={`${fieldClass} h-11 tabular`} />
                <span className="text-muted">–</span>
                <input name="ageMax" type="number" min={13} max={100} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className={`${fieldClass} h-11 tabular`} />
              </div>
            </Field>
            <Field label="Genders" hint="None checked = everyone">
              <div className="flex gap-2">
                {(["female", "male"] as const).map((g) => (
                  <label key={g} className={chipClass}>
                    <input type="checkbox" name="genders" value={g} checked={genders.includes(g)} onChange={() => setGenders((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]))} className="sr-only" />
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
        <StepFooter index={1} count={steps.length} onBack={back} onNext={next} note="Next: placements and budget" />
        </StepPanel>

        <StepPanel active={step === 2} title="Placements and budget" lede="Only creatives rendered in a chosen placement's size can be added in the next step.">
        <section className="panel flex flex-col gap-6 p-6">
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
              <input name="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`${fieldClass} h-11`} />
            </Field>
            <Field label="End" hint="Optional">
              <input name="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`${fieldClass} h-11`} />
            </Field>
          </div>
          {needsApproval ? <Notice tone="info">Budgets above {money(props.spendApprovalAbove! * 100, currency)} / day can be published as paused; an owner switches them on.</Notice> : null}
        </section>
        <StepFooter index={2} count={steps.length} onBack={back} onNext={next} nextDisabled={Boolean(step3Error)} note={step3Error ?? "Next: pick the ads"} />
        </StepPanel>

        <StepPanel active={step === 3} title="Which ads?" lede="Finished renders that fit the placements you chose. Hard spec failures can't be selected; warnings are yours to judge.">
        <section className="panel flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <span className="text-[13px] text-muted">{matching.length} creative{matching.length === 1 ? "" : "s"} · {allValid.length} valid size{allValid.length === 1 ? "" : "s"}</span>
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
        <StepFooter index={3} count={steps.length} onBack={back} onNext={next} nextDisabled={Boolean(step4Error)} note={step4Error ?? "Next: review and publish"} />
        </StepPanel>

        <StepPanel active={step === 4} title="Review and publish" lede={`This is exactly what Adcraft will create on ${platformName}. Nothing runs until you say so.`}>
        <section className="panel flex flex-col gap-5 p-6">
          {account.sandbox ? <Notice tone="info"><strong>Sandbox account.</strong> Every step runs for real inside Adcraft, but nothing reaches {platformName} and the performance numbers will be simulated.</Notice> : null}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
            <dt className="text-muted">Account</dt><dd className="m-0 font-semibold"><span className="inline-flex items-center gap-2"><PlatformMark platform={account.platform} sandbox={account.sandbox} /> {account.name}</span></dd>
            <dt className="text-muted">Campaign</dt><dd className="m-0 font-semibold">{name || "—"} · {objectiveLabel}</dd>
            <dt className="text-muted">Audience</dt><dd className="m-0 font-semibold">{countriesSummary} · {ageSummary}{gendersSummary ? ` · ${gendersSummary}` : ""}</dd>
            <dt className="text-muted">Placements</dt><dd className="m-0 font-semibold">{platformPlacements.filter((p) => placementIds.includes(p.id)).map((p) => p.label).join(", ") || "—"}</dd>
            <dt className="text-muted">Budget</dt><dd className="tabular m-0 font-semibold">{money(dailyMinor, currency)} / day{scheduleSummary}</dd>
            <dt className="text-muted">Landing page</dt><dd className="m-0 truncate font-semibold">{landingOk ? landingUrl : "per creative"}</dd>
            <dt className="text-muted">Creates</dt><dd className="m-0 font-semibold">1 campaign · 1 ad set · {chosen.length} ad{chosen.length === 1 ? "" : "s"}{warnings ? <span className="ml-1.5 font-normal text-[#b7791f]">· {warnings} warning{warnings === 1 ? "" : "s"}</span> : null}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {chosen.map((v) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={v.variantId} src={v.previewUrl} alt="" title={`${v.placementLabel} · ${v.ratio}`} className="h-[72px] w-[56px] rounded-[5px] border border-line object-cover" />
            ))}
          </div>
          <SubmitButtons disabled={chosen.length === 0 || Boolean(step1Error) || Boolean(step3Error)} sandbox={account.sandbox} needsApproval={needsApproval} />
        </section>
        <StepFooter index={4} count={steps.length} onBack={back} onNext={next} note="Adcraft stores every platform id it creates and never duplicates on retry. Ad spend is billed by the platform to your own account."><span /></StepFooter>
        </StepPanel>
      </div>
    </form>
  );
}
