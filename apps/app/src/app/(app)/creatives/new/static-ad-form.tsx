"use client";

import { useState } from "react";
import Link from "next/link";
import { PendingButton } from "@/components/pending-button";
import { TemplateThumb } from "../template-thumb";
import { createCreativeFromConcept } from "../actions";
import type { StaticTemplate } from "@adcraft/render";
import styles from "./static-ad-form.module.css";

export type ModelChoice = { id: string; label: string; notes: string; provider: string; enabled: boolean; configured: boolean; credits: number; isDefault: boolean };
// Recommended models: the server marks its default; fall back to any connected model.
const pickBest = (models: ModelChoice[]) => models.find((m) => m.isDefault && m.configured && m.enabled)?.id ?? models.find((m) => m.configured && m.enabled)?.id ?? models[0]?.id ?? "";
/** "Fast draft" is the cheapest connected model; falls back to the default when nothing is cheaper. */
const pickFast = (models: ModelChoice[], best: string) => {
  const bestCredits = models.find((m) => m.id === best)?.credits ?? Infinity;
  const cheaper = models.filter((m) => m.configured && m.enabled && m.credits < bestCredits).sort((a, b) => a.credits - b.credits)[0];
  return cheaper?.id ?? best;
};
const directions: Array<{ id: StaticTemplate; title: string; note: string }> = [
  { id: "hero", title: "Product spotlight", note: "Immersive. Warm. All eyes on you." },
  { id: "split", title: "Editorial split", note: "A story in two perfect halves." },
  { id: "minimal", title: "Quiet luxury", note: "A little space goes a long way." },
  { id: "bold", title: "Bold statement", note: "Made to stop the scroll." },
];
export function StaticAdForm({ concept, models, saved, sizes, balance, canEdit }: {
  concept: { id: string; briefId: string; headline: string; hook: string; cta: string; brand: string; direction: string; product: string | null; imageUrl: string | null; colors: { primary: string; accent: string } };
  models: ModelChoice[];
  saved: Array<{ id: string; name: string; template: StaticTemplate }>;
  sizes: Array<{ id: string; ratio: string; width: number; height: number; label: string }>;
  balance: number; canEdit: boolean;
}) {
  const [mode, setMode] = useState<"ai" | "editable">("ai");
  const [quality, setQuality] = useState("best");
  const [override, setOverride] = useState("");
  const [template, setTemplate] = useState("hero");
  const [placements, setPlacements] = useState(["meta.feed.4x5"]);
  const best = pickBest(models);
  const fast = pickFast(models, best);
  const modelId = override || (quality === "fast" ? fast : best);
  const model = models.find((m) => m.id === modelId);
  const available = Boolean(model?.enabled && model?.configured);
  const credits = (model?.credits ?? 0) * (mode === "ai" ? placements.length : 1);
  const toggle = (id: string) => setPlacements((previous) => previous.includes(id) ? previous.filter((p) => p !== id) : [...previous, id]);
  return <form action={createCreativeFromConcept} className={styles.studio}>
    <input type="hidden" name="conceptId" value={concept.id} />
    <input type="hidden" name="model" value={modelId} />
    <div className={styles.main}>
      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.step}>01</span><h2>Choose your creative approach</h2></div><span className={styles.micro}>Your idea, your level of control</span></div>
        <div className={styles.modes}>
          {([
            ["ai", "✳", "AI-designed ad", "Let AI compose the whole picture.", "Photography, typography and layout, designed together."],
            ["editable", "▤", "Editable brand ad", "Your brand, down to the last detail.", "AI background with editable copy, logo and product layers."],
          ] as const).map(([id, icon, title, line, note]) => <label key={id} className={`${styles.mode} ${mode === id ? styles.selected : ""}`}>
            <input type="radio" name="generationMode" value={id} checked={mode === id} onChange={() => { setMode(id); setOverride(""); if (id === "ai" && template.startsWith("saved:")) setTemplate("hero"); }} />
            <span className={styles.modeIcon} aria-hidden="true">{icon}</span><span className={styles.modeTitle}>{title}{id === "ai" && <small>RECOMMENDED</small>}</span>
            <strong>{line}</strong><p>{note}</p>
          </label>)}
        </div>
        <p className={styles.modeHint}>{mode === "ai" ? "A finished image in every selected size. Refine it with instructions after generation; review copy and branding before publishing." : "Change copy, adjust your layout and resize without generating another image. Your product and logo stay as separate layers."}</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.step}>02</span><h2>Set the art direction</h2></div><span className={styles.micro}>Four ways to make an impression</span></div>
        <div className={styles.templates}>
          {directions.map((d) => <label key={d.id} className={`${styles.template} ${template === d.id ? styles.chosen : ""}`}>
            <input type="radio" name="template" value={d.id} checked={template === d.id} onChange={() => setTemplate(d.id)} />
            <div className={styles.art}><TemplateThumb template={d.id} colors={concept.colors} /><span className={styles.check} aria-hidden="true">✓</span></div>
            <span className={styles.templateTitle}>{d.title}<span aria-hidden="true">↗</span></span><span className={styles.templateNote}>{d.note}</span>
          </label>)}
        </div>
        <p className={styles.exampleNote}>Illustrative layouts · Your product, brief and brand guide the final result.</p>
        {mode === "editable" && saved.length > 0 && <details className={styles.advanced}><summary>Saved brand layouts <span>{saved.length} layouts</span></summary><div className={styles.saved}>{saved.map((s) => <label key={s.id}><input type="radio" name="template" value={`saved:${s.id}`} checked={template === `saved:${s.id}`} onChange={() => setTemplate(`saved:${s.id}`)} />{s.name}</label>)}</div></details>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.step}>03</span><h2>Fine-tune your output</h2></div></div>
        <div className={styles.outputGrid}>
          <fieldset><legend>Generation quality</legend><div className={styles.quality}>
            {[["best", "Best quality", "For the final impression"], ["fast", "Fast draft", "Explore more ideas"]].map(([id, title, note]) => <label key={id} className={quality === id && !override ? styles.qualityActive : ""}><input type="radio" name="quality" value={id} checked={quality === id} onChange={() => { setQuality(id); setOverride(""); }} /><strong>{title}</strong><span>{note}</span></label>)}
          </div><span className={styles.modelName}>{model?.label} · {model?.credits} {model?.credits === 1 ? "credit" : "credits"} / {mode === "ai" ? "size" : "background"}</span></fieldset>
          <fieldset><legend>Export sizes</legend><div className={styles.sizes}>{sizes.map((s) => <label key={s.id} className={placements.includes(s.id) ? styles.sizeSelected : ""}><input type="checkbox" name="placements" value={s.id} checked={placements.includes(s.id)} onChange={() => toggle(s.id)} /><strong>{s.ratio}</strong><span>{s.width} × {s.height}</span></label>)}</div></fieldset>
        </div>
        <details className={styles.advanced}><summary>Advanced model settings <span>{override ? "Custom selection" : "Automatic"}</span></summary><label className={styles.advancedLabel}>Image model<select value={override} onChange={(e) => setOverride(e.target.value)}><option value="">Recommended for selected quality</option>{models.map((m) => <option key={m.id} value={m.id} disabled={!m.enabled}>{m.label} · {m.credits} credits{!m.enabled ? " · disabled" : !m.configured ? " · not connected" : ""}</option>)}</select></label></details>
        {!available && <div className={styles.notice} role="status"><strong>{model?.enabled === false ? `${model.label} is turned off` : `${model?.label ?? "This model"} is not connected`}</strong><span>{model?.enabled === false ? "An admin disabled this model. Pick another under Advanced model settings." : model?.provider === "openai" ? "Add OPENAI_API_KEY on the server, or pick a connected model under Advanced model settings." : "Add FAL_KEY on the server, or pick a connected model under Advanced model settings."}</span></div>}
      </section>

      <footer className={styles.footer}><div aria-live="polite"><strong>{credits} {credits === 1 ? "credit" : "credits"} <span>· {placements.length} {placements.length === 1 ? "size" : "sizes"}</span></strong><p>{mode === "ai" ? "A distinct composition for each size." : "One background. Every selected size."} {balance} credits available.</p></div><PendingButton className="btn btn-orange h-11" pendingLabel="Preparing your studio…" disabled={!canEdit || !available || !placements.length || balance < credits}>Generate {mode === "ai" ? "ad" : "creative"}<span aria-hidden="true">↗</span></PendingButton></footer>
      {balance < credits && <p role="alert" className={styles.error}>You need {credits - balance} more credits. <Link href="/settings/billing">Manage credits</Link></p>}
      {!canEdit && <p className={styles.error}>An editor or owner can generate ads for this workspace.</p>}
    </div>

    <aside className={styles.aside}>
      <section className={styles.brief}><div className={styles.briefHeading}><span className="eyebrow">YOUR CREATIVE BRIEF</span><span className={styles.liveDot}>Ready</span></div>
        <div className={styles.product}>{concept.imageUrl ? <img src={concept.imageUrl} alt={concept.product ?? "Product reference"} /> : <span className={styles.productInitial}>{concept.brand.slice(0, 1)}</span>}<div><strong>{concept.product ?? concept.brand}</strong><span>{concept.brand} · Brand kit applied</span></div></div>
        <div className={styles.briefCopy}><span className={styles.label}>THE MESSAGE</span><h3>{concept.headline}</h3><p>{concept.hook}</p><span className={styles.cta}>{concept.cta}<span aria-hidden="true">↗</span></span></div>
        <div className={styles.direction}><span className={styles.label}>VISUAL DIRECTION</span><p>{concept.direction}</p></div>
        <div className={styles.brandFooter}><span className={styles.swatches}>{[concept.colors.primary, concept.colors.accent, "#f5f1e8"].map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>Made for {concept.brand}</span></div>
      </section>
      <div className={styles.asideNote}><span aria-hidden="true">✳</span><div><strong>A starting point. Never a limit.</strong><p>{mode === "ai" ? "Fine-tune the result with image edits, then share it for review before launch." : "Every text and brand layer stays editable. Make it yours in the editor."}</p></div></div>
      <Link className={styles.back} href={`/briefs/${concept.briefId}`}>← Back to creative brief</Link>
    </aside>
  </form>;
}
