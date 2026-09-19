"use client";

import { useState } from "react";
import type { BrandKitData } from "@adcraft/db";
import { COLOR_FIELDS, CTA_STYLES, KIT_FONTS, KIT_FONTS_STYLESHEET, KIT_TONES, fontStack, normalizeHex, type ColorKey } from "@/lib/brand-kit";
import { LOGO_ACCEPT } from "@/lib/uploads";
import { ImagePicker } from "./image-picker";

export type BrandKitEditorProps = {
  brand: { id: string; name: string; website: string | null; industry: string | null };
  kit: BrandKitData;
  action: (formData: FormData) => Promise<void>;
};

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";
const textareaClass =
  "min-h-[96px] w-full rounded-[7px] border border-line bg-surface px-3 py-2.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      {hint ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">{title}</span>
          <span className="text-[11px] text-muted">{hint}</span>
        </div>
      ) : (
        <span className="eyebrow">{title}</span>
      )}
      {children}
    </section>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="field-label">
        {label} {optional ? <span className="field-hint">Optional</span> : null}
      </span>
      {children}
    </label>
  );
}

export function BrandKitEditor({ brand, kit, action }: BrandKitEditorProps) {
  const [name, setName] = useState(brand.name);
  const [colors, setColors] = useState<Record<ColorKey, string>>({
    primary: kit.colors.primary,
    secondary: kit.colors.secondary ?? "#75756d",
    accent: kit.colors.accent ?? "#e65c32",
    background: kit.colors.background ?? "#f8f7f3",
    text: kit.colors.text ?? "#242521",
  });
  // Hex text fields can be mid-edit (e.g. "#e6"), so keep the raw text separately.
  const [hexText, setHexText] = useState<Record<ColorKey, string>>({ ...colors });
  const [fonts, setFonts] = useState({ heading: kit.fonts.heading, body: kit.fonts.body });
  const [tone, setTone] = useState<string[]>(kit.voice?.tone ?? []);
  const [tagline, setTagline] = useState(kit.tagline ?? "");
  const [ctaStyle, setCtaStyle] = useState(kit.ctaStyle ?? "pill");
  const [doSay, setDoSay] = useState((kit.voice?.doSay ?? []).join("\n"));
  const [dontSay, setDontSay] = useState((kit.voice?.dontSay ?? []).join("\n"));
  const [logoUrl, setLogoUrl] = useState<string | null>(kit.logoUrl ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const setColor = (key: ColorKey, value: string) => {
    setHexText((h) => ({ ...h, [key]: value }));
    const hex = normalizeHex(value, "");
    if (hex) setColors((c) => ({ ...c, [key]: hex }));
  };

  return (
    <form id="brand-kit-form" action={action} className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <link rel="stylesheet" href={KIT_FONTS_STYLESHEET} precedence="default" />

      <div className="flex min-w-0 flex-col gap-4">
        <Section title="Identity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
            <Field label="Brand name">
              <input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Industry" optional>
              <input name="industry" defaultValue={brand.industry ?? ""} placeholder="Skincare, coffee, software…" className={inputClass} />
            </Field>
          </div>
          <Field label="Website" optional>
            <input name="website" defaultValue={brand.website ?? ""} placeholder="https://" className={inputClass} />
          </Field>
          <div className="flex flex-wrap items-start gap-4">
            <ImagePicker
              name="logo"
              accept={LOGO_ACCEPT}
              compact
              currentUrl={removeLogo ? null : logoUrl}
              label="Logo"
              onPreview={(url) => {
                setLogoUrl(url ?? kit.logoUrl ?? null);
                if (url) setRemoveLogo(false);
              }}
            />
            <div className="flex flex-col gap-1.5 pt-1 text-[12px] text-muted">
              <span className="font-semibold text-ink">Logo</span>
              <span>PNG, SVG, JPG or WebP. Transparent PNG or SVG works best on generated scenes.</span>
              {kit.logoUrl ? (
                <label className="mt-1 flex items-center gap-2 text-[12px]">
                  <input type="checkbox" name="removeLogo" value="1" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} />
                  Remove current logo
                </label>
              ) : null}
            </div>
          </div>
        </Section>

        <Section title="Colours" hint="Hex values">
          <div className="grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-center gap-3 rounded-[7px] border border-line bg-surface p-2.5">
                <label className="swatch relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-[7px]" style={{ background: colors[key] }}>
                  <input
                    type="color"
                    aria-label={`${label} colour`}
                    value={colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="whitespace-nowrap text-[12px] font-semibold">{label}</span>
                  <span className="text-[11px] leading-snug text-muted">{hint}</span>
                </div>
                <input
                  name={`color.${key}`}
                  value={hexText[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  onBlur={() => setHexText((h) => ({ ...h, [key]: colors[key] }))}
                  spellCheck={false}
                  className="tabular h-9 w-[86px] rounded-[5px] border border-line bg-paper px-2 font-mono text-[12px] uppercase outline-none focus:border-ink"
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="grid gap-4 md:grid-cols-2">
            {(["heading", "body"] as const).map((slot) => (
              <div key={slot} className="flex flex-col gap-2">
                <Field label={slot === "heading" ? "Heading font" : "Body font"}>
                  <select name={`font.${slot}`} value={fonts[slot]} onChange={(e) => setFonts((f) => ({ ...f, [slot]: e.target.value }))} className={inputClass}>
                    {KIT_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-[7px] border border-line bg-paper px-3 py-2.5" style={{ fontFamily: fontStack(fonts[slot]) }}>
                  {slot === "heading" ? (
                    <span className="text-[22px] leading-[1.1] tracking-[-0.5px]">Made for mornings that matter.</span>
                  ) : (
                    <span className="text-[13px] leading-[1.5] text-ink">Short, honest copy that sounds like you. Ships in every size.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Voice" hint={`${tone.length} selected`}>
          <div className="flex flex-wrap gap-2">
            {KIT_TONES.map((t) => {
              const on = tone.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTone((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium capitalize transition ${
                    on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-ink"
                  }`}
                >
                  {on ? <span className="text-orange">✓</span> : null}
                  {t}
                </button>
              );
            })}
          </div>
          {tone.map((t) => (
            <input key={t} type="hidden" name="tone" value={t} />
          ))}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Do say">
              <textarea name="doSay" value={doSay} onChange={(e) => setDoSay(e.target.value)} placeholder={"One per line\nclinically tested\nfor real mornings"} className={textareaClass} />
            </Field>
            <Field label="Don't say">
              <textarea name="dontSay" value={dontSay} onChange={(e) => setDontSay(e.target.value)} placeholder={"One per line\nmiracle\ncheap"} className={textareaClass} />
            </Field>
          </div>
        </Section>

        <Section title="Copy">
          <Field label="Tagline" optional>
            <input name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Skin that keeps up with you." className={inputClass} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="field-label">CTA style</span>
            <div className="flex w-fit gap-1 rounded-[7px] border border-line bg-surface p-[3px] text-[12px] font-medium">
              {CTA_STYLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={ctaStyle === c.id}
                  onClick={() => setCtaStyle(c.id)}
                  className={`inline-flex min-h-9 items-center rounded-[5px] px-3 ${ctaStyle === c.id ? "bg-ink text-paper" : "text-ink hover:bg-paper"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="ctaStyle" value={ctaStyle} />
          </div>
        </Section>
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-[86px] xl:self-start">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Preview</span>
          <span className="text-[11px] text-muted">Updates as you type</span>
        </div>
        <PreviewCard
          brandName={name || "Your brand"}
          logoUrl={removeLogo ? null : logoUrl}
          colors={colors}
          fonts={fonts}
          tagline={tagline}
          body={doSay.split("\n").map((l) => l.trim()).filter(Boolean)[0]}
          ctaStyle={ctaStyle}
          tone={tone}
        />
        <div className="flex items-center gap-1.5 px-0.5">
          {COLOR_FIELDS.map(({ key, label }) => (
            <span key={key} title={`${label} ${colors[key]}`} className="swatch h-5 flex-1 rounded-[4px]" style={{ background: colors[key] }} />
          ))}
        </div>
        <p className="m-0 text-[12px] text-muted">
          Static ads are layered: the scene is generated, but text, logo and CTA are rendered with these exact colours and fonts.
        </p>
      </aside>
    </form>
  );
}

function PreviewCard({
  brandName,
  logoUrl,
  colors,
  fonts,
  tagline,
  body,
  ctaStyle,
  tone,
}: {
  brandName: string;
  logoUrl: string | null;
  colors: Record<ColorKey, string>;
  fonts: { heading: string; body: string };
  tagline: string;
  body?: string;
  ctaStyle: string;
  tone: string[];
}) {
  const radius = ctaStyle === "pill" ? 999 : ctaStyle === "rounded" ? 7 : 0;
  const outline = ctaStyle === "outline";
  return (
    <div className="tile flex aspect-[4/5] flex-col justify-between p-5" style={{ background: colors.background, color: colors.text }}>
      <div className="flex items-center justify-between">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="max-h-7 max-w-[120px] object-contain" />
        ) : (
          <span className="text-[15px] font-semibold tracking-[-0.4px]" style={{ fontFamily: fontStack(fonts.heading), color: colors.primary }}>
            {brandName}
          </span>
        )}
        <span className="rounded-full px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[1px]" style={{ background: colors.accent, color: colors.background }}>
          New
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-[30px] leading-[1.02] tracking-[-1px]" style={{ fontFamily: fontStack(fonts.heading), color: colors.primary }}>
          {tagline || "Made for mornings that matter."}
        </div>
        <p className="m-0 max-w-[26ch] text-[13px] leading-[1.45]" style={{ fontFamily: fontStack(fonts.body), color: colors.secondary }}>
          {body ?? "Short, honest copy in your voice. Every size it needs to be."}
        </p>
        <span
          className="inline-flex h-10 w-fit items-center px-4 text-[13px] font-semibold"
          style={{
            fontFamily: fontStack(fonts.body),
            borderRadius: radius,
            background: outline ? "transparent" : colors.accent,
            color: outline ? colors.accent : "#fff",
            border: `1.5px solid ${colors.accent}`,
          }}
        >
          Shop now →
        </span>
        <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-[1px]" style={{ color: colors.secondary, fontFamily: fontStack(fonts.body) }}>
          {tone.length ? tone.join(" · ") : "tone not set"}
        </div>
      </div>
    </div>
  );
}
