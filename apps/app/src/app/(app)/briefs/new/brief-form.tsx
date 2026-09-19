"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PlatformLogo } from "@/components/platform-logo";
import { PendingButton } from "@/components/pending-button";
import { Spark } from "@/components/spark";
import { FORMATS, OBJECTIVES, PLATFORMS } from "@/lib/brief-fields";
import { createBrief, suggestBriefFields, type BriefDraftInput } from "../actions";

const fieldClass =
  "w-full rounded-[7px] border border-line bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink";
const chipClass =
  "inline-flex h-11 cursor-pointer select-none items-center rounded-[7px] border border-line bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper";

type BriefField =
  | "all"
  | "title"
  | "productId"
  | "objective"
  | "audience"
  | "offer"
  | "platforms"
  | "formats"
  | "tone"
  | "constraints";

type ProductOption = { id: string; name: string };

export type BriefFormInitial = BriefDraftInput;

function filled(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value.trim());
}

function Field({
  label,
  hint,
  scope,
  hasValue,
  busy,
  onAssist,
  children,
}: {
  label: string;
  hint?: string;
  scope: Exclude<BriefField, "all">;
  hasValue: boolean;
  busy: BriefField | null;
  onAssist: (scope: BriefField) => void;
  children: React.ReactNode;
}) {
  const working = busy === scope || busy === "all";
  return (
    <div className="flex flex-col gap-2">
      <div className="field-label">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {hint ? <span className="field-hint">{hint}</span> : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-semibold text-orange hover:underline disabled:cursor-wait disabled:no-underline disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => onAssist(scope)}
          >
            {working ? <Spark size={11} animate="spin" className="text-orange" /> : null}
            {hasValue ? "Improve" : "Suggest"}
          </button>
        </span>
      </div>
      {children}
    </div>
  );
}

export function BriefForm({
  products,
  brandName,
  brandHref,
  credits,
  missing,
  prefillNote,
  initial,
}: {
  products: ProductOption[];
  brandName: string;
  brandHref: string;
  credits: number;
  missing: string[];
  prefillNote: string | null;
  initial: BriefFormInitial;
}) {
  const [draft, setDraft] = useState<BriefDraftInput>(initial);
  const [busy, setBusy] = useState<BriefField | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const assist = (scope: BriefField) => {
    setError("");
    setBusy(scope);
    startTransition(async () => {
      const result = await suggestBriefFields({ scope, draft });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft((prev) => {
        if (scope === "all") {
          return {
            title: result.draft.title,
            productId: result.draft.productId,
            objective: result.draft.objective,
            audience: result.draft.audience,
            offer: result.draft.offer,
            platforms: result.draft.platforms,
            formats: result.draft.formats,
            tone: result.draft.tone,
            constraints: result.draft.constraints.join("\n"),
          };
        }
        if (scope === "constraints") return { ...prev, constraints: result.draft.constraints.join("\n") };
        if (scope === "platforms") return { ...prev, platforms: result.draft.platforms };
        if (scope === "formats") return { ...prev, formats: result.draft.formats };
        return { ...prev, [scope]: result.draft[scope] };
      });
      setNote(result.draft.note);
    });
  };

  const emptyCore = !filled(draft.title) && !filled(draft.audience) && !filled(draft.offer);
  const toggle = (key: "platforms" | "formats", id: string) => {
    setDraft((prev) => {
      const on = prev[key].includes(id);
      return { ...prev, [key]: on ? prev[key].filter((x) => x !== id) : [...prev[key], id] };
    });
  };

  return (
    <form
      action={createBrief}
      className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]"
    >
      <div className="panel flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[13px] text-muted">
            Suggest fills a blank. Improve rewrites whatever you typed — including random notes — using {brandName}&rsquo;s kit.
          </p>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-surface px-3 text-[12px] font-semibold text-ink hover:border-ink disabled:opacity-50"
            disabled={busy !== null || pending}
            onClick={() => assist("all")}
          >
            {busy === "all" ? <Spark size={13} animate="spin" className="text-orange" /> : null}
            {emptyCore ? "Write the brief" : "Polish the brief"}{" "}
            <span aria-hidden="true">↗︎</span>
          </button>
        </div>

        {prefillNote ? (
          <div className="rounded-[7px] border border-[#cfe3d6] bg-[#e9f3ec] px-4 py-3 text-[13px] text-[#3f7a55]">
            {prefillNote}
          </div>
        ) : null}
        {missing.length ? (
          <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">
            Add {missing.join(", ")} and try again.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]" role="alert">
            {error}
          </div>
        ) : null}
        {note && !error ? (
          <div className="rounded-[7px] border border-[#cfe3d6] bg-[#e9f3ec] px-4 py-3 text-[13px] text-[#3f7a55]">{note}</div>
        ) : null}

        <Field label="Title" scope="title" hasValue={filled(draft.title)} busy={busy} onAssist={assist}>
          <input
            name="title"
            aria-label="Brief title"
            required
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Q4 launch: Everyday Serum"
            className={`${fieldClass} h-11`}
          />
        </Field>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Product" hint="Optional" scope="productId" hasValue={filled(draft.productId)} busy={busy} onAssist={assist}>
            <select
              name="productId"
              aria-label="Product"
              value={draft.productId}
              onChange={(e) => setDraft((d) => ({ ...d, productId: e.target.value }))}
              className={`${fieldClass} h-11`}
            >
              <option value="">Whole brand — no specific product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {products.length === 0 ? (
              <span className="text-[11px] text-muted">
                No products in {brandName} yet.{" "}
                <Link href="/library/new" className="font-semibold text-orange">
                  Add one ↗︎
                </Link>
              </span>
            ) : null}
          </Field>

          <Field label="Objective" scope="objective" hasValue={filled(draft.objective)} busy={busy} onAssist={assist}>
            <div className="flex flex-wrap gap-2">
              {OBJECTIVES.map((o) => (
                <label key={o.id} className={chipClass} title={o.hint}>
                  <input
                    type="radio"
                    name="objective"
                    value={o.id}
                    checked={draft.objective === o.id}
                    onChange={() => setDraft((d) => ({ ...d, objective: o.id }))}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Audience" hint="Who is this for?" scope="audience" hasValue={filled(draft.audience)} busy={busy} onAssist={assist}>
          <textarea
            name="audience"
            aria-label="Audience"
            required
            rows={2}
            value={draft.audience}
            onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
            placeholder="women 25–40 who care about clean skincare and already buy from DTC brands"
            className={`${fieldClass} min-h-[72px] resize-y py-3`}
          />
        </Field>

        <Field
          label="Offer / key message"
          hint="The one thing the ad must say"
          scope="offer"
          hasValue={filled(draft.offer)}
          busy={busy}
          onAssist={assist}
        >
          <textarea
            name="offer"
            aria-label="Offer or key message"
            rows={2}
            value={draft.offer}
            onChange={(e) => setDraft((d) => ({ ...d, offer: e.target.value }))}
            placeholder="20% off the first order · a morning routine that takes two minutes"
            className={`${fieldClass} min-h-[72px] resize-y py-3`}
          />
        </Field>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Platforms" scope="platforms" hasValue={filled(draft.platforms)} busy={busy} onAssist={assist}>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={chipClass}>
                  <input
                    type="checkbox"
                    name="platforms"
                    value={p.id}
                    checked={draft.platforms.includes(p.id)}
                    onChange={() => toggle("platforms", p.id)}
                    className="sr-only"
                  />
                  <PlatformLogo name={p.id} size={15} className="mr-2" />
                  {p.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Formats" scope="formats" hasValue={filled(draft.formats)} busy={busy} onAssist={assist}>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <label key={f.id} className={chipClass}>
                  <input
                    type="checkbox"
                    name="formats"
                    value={f.id}
                    checked={draft.formats.includes(f.id)}
                    onChange={() => toggle("formats", f.id)}
                    className="sr-only"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Tone" hint="Optional — overrides the brand kit" scope="tone" hasValue={filled(draft.tone)} busy={busy} onAssist={assist}>
            <input
              name="tone"
              aria-label="Tone"
              value={draft.tone}
              onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
              placeholder="playful, direct, no jargon"
              className={`${fieldClass} h-11`}
            />
          </Field>
          <Field label="Constraints" hint="One per line" scope="constraints" hasValue={filled(draft.constraints)} busy={busy} onAssist={assist}>
            <textarea
              name="constraints"
              aria-label="Constraints"
              rows={2}
              value={draft.constraints}
              onChange={(e) => setDraft((d) => ({ ...d, constraints: e.target.value }))}
              placeholder={"no medical claims\nalways show the bottle"}
              className={`${fieldClass} min-h-[72px] resize-y py-3`}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <PendingButton className="btn btn-orange h-11" pendingLabel="Starting…" disabled={busy !== null}>
            Generate concepts{" "}
            <span aria-hidden="true" className="text-lg leading-none">
              ↗︎
            </span>
          </PendingButton>
          <Link href="/briefs" className="btn btn-outline h-11">
            Cancel
          </Link>
          <span className="text-[12px] text-muted">
            Suggestions don&rsquo;t spend a credit. Generating concepts costs 1 · {credits} left.
          </span>
        </div>
      </div>

      <aside className="side-sticky flex flex-col gap-4">
        <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
          <span className="eyebrow">What you get</span>
          <p className="m-0 text-[13px] text-muted">
            Eight concepts, each with a hook, a persuasion angle, platform-ready copy, a visual
            direction and — for video and UGC — a scene-by-scene script. Pick the ones you like and
            make the ad.
          </p>
        </section>
        <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
          <span className="eyebrow">Brand kit</span>
          <p className="m-0 text-[13px] text-muted">
            Suggestions and concepts use {brandName}&rsquo;s tone, do-say and don&rsquo;t-say lists.{" "}
            <Link href={brandHref} className="font-semibold text-orange">
              Edit kit ↗︎
            </Link>
          </p>
        </section>
        <section className="flex flex-col gap-2 px-0.5 py-1">
          <span className="eyebrow">Good briefs</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px] text-ink">
            <li>Name the person, not the demographic.</li>
            <li>One offer per brief. Make another brief for another offer.</li>
            <li>
              Constraints beat adjectives: &ldquo;no before/after photos&rdquo; is better than
              &ldquo;tasteful&rdquo;.
            </li>
          </ul>
        </section>
      </aside>
    </form>
  );
}
