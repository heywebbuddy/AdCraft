"use client";

import { useState, useTransition } from "react";
import { Spark } from "@/components/spark";
import type { StaticAdDocument, StaticTemplate } from "@adcraft/render";
import { TemplateThumb } from "../template-thumb";

export type EditorProps = {
  creativeId: string;
  document: StaticAdDocument;
  templates: Array<{ id: StaticTemplate; label: string }>;
  busy: boolean;
  onSave: (formData: FormData) => Promise<void>;
};

const fieldClass = "w-full rounded-[7px] border border-line bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {hint ? <span className="tabular text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Document editor: every change saves the document and re-renders all sizes. */
export function Editor({ creativeId, document: doc, templates, busy, onSave }: EditorProps) {
  const [pending, start] = useTransition();
  const [headlineSize, setHeadlineSize] = useState(doc.layout.headlineSize);
  const [overlay, setOverlay] = useState(doc.layout.overlay);
  const [scale, setScale] = useState(doc.product?.scale ?? 1);
  const [template, setTemplate] = useState<StaticTemplate>(doc.template);
  const colors = { primary: doc.brand.colors.primary, accent: doc.brand.colors.accent };
  const disabled = pending || busy;

  return (
    <form
      key={creativeId + doc.template + doc.headline + doc.cta}
      action={(fd) => start(() => onSave(fd))}
      className="flex flex-col gap-5"
      aria-busy={disabled}
    >
      <Field label="Template">
        <div className="grid grid-cols-4 gap-2">
          {templates.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer flex-col gap-1.5 rounded-[7px] border p-1.5 transition-colors hover:border-ink ${
                template === t.id ? "border-ink shadow-[0_0_0_1px_#242521]" : "border-line"
              }`}
            >
              <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} className="sr-only" />
              <TemplateThumb template={t.id} colors={colors} />
              <span className="text-center text-[11px] font-semibold">{t.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Headline" hint={`${doc.headline.length} / 40`}>
        <input name="headline" defaultValue={doc.headline} maxLength={60} required className={`${fieldClass} h-11`} />
      </Field>
      <Field label="Subhead" hint="Optional">
        <textarea name="subhead" defaultValue={doc.subhead ?? ""} rows={2} maxLength={125} className={`${fieldClass} min-h-[64px] resize-y py-2.5`} />
      </Field>
      <Field label="CTA">
        <input name="cta" defaultValue={doc.cta} maxLength={20} required className={`${fieldClass} h-11`} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Align">
          <div className="flex gap-1 rounded-[7px] border border-line bg-surface p-[3px] text-[12px] font-medium">
            {(["left", "center"] as const).map((a) => (
              <label key={a} className="flex-1 cursor-pointer">
                <input type="radio" name="align" value={a} defaultChecked={doc.layout.align === a} className="peer sr-only" />
                <span className="flex min-h-9 items-center justify-center rounded-[5px] capitalize text-ink peer-checked:bg-ink peer-checked:text-paper">{a}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Headline size" hint={`${headlineSize}px`}>
          <input
            type="range"
            name="headlineSize"
            min={48}
            max={140}
            step={2}
            value={headlineSize}
            onChange={(e) => setHeadlineSize(Number(e.target.value))}
            className="h-11 w-full accent-[#e65c32]"
          />
        </Field>
        <Field label="Overlay" hint={`${Math.round(overlay * 100)}%`}>
          <input
            type="range"
            name="overlay"
            min={0}
            max={1}
            step={0.05}
            value={overlay}
            onChange={(e) => setOverlay(Number(e.target.value))}
            className="h-11 w-full accent-[#e65c32]"
          />
        </Field>
        <Field label="Product size" hint={doc.product ? `${Math.round(scale * 100)}%` : "No product"}>
          <input
            type="range"
            name="productScale"
            min={0.4}
            max={1.6}
            step={0.05}
            value={scale}
            disabled={!doc.product}
            onChange={(e) => setScale(Number(e.target.value))}
            className="h-11 w-full accent-[#e65c32] disabled:opacity-40"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="submit" disabled={disabled} className="btn btn-dark h-11 disabled:cursor-not-allowed disabled:opacity-60">
          {pending || busy ? <Spark size={14} animate="spin" /> : null}
          {pending ? "Saving…" : busy ? "Rendering…" : "Save & re-render"}
        </button>
        <span className="text-[12px] text-muted">Re-rendering is free. The scene stays as it is.</span>
      </div>
    </form>
  );
}
