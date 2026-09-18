"use client";

export type LookPackCard = { id: string; name: string; kind: "style" | "role"; description: string; palette: [string, string, string]; previews: { female: string; male: string }; looks: number; type: "look_pack" | "template" };
/** Any HeyGen library look chosen as a single template ("remix this look"). */
export type RemixLook = { id: string; name: string; person: string; previewUrl: string | null };

export type LookPackState = {
  packId: string;
  gender: "female" | "male";
  ratio: "16:9" | "9:16";
  prompt: string;
  lookName: string;
  remix?: RemixLook | null;
};

/**
 * HeyGen look packs as a gallery: wardrobe variant, frame, the pack cards (HeyGen's own
 * thumbnails, palette behind while loading), "remix a library look" (any presenter-library
 * look as a template) and "your own words" for a prompt look. Shared by the Design-a-look page and the new-look dialog. Styles: studio.css (.lp-*).
 */
export function LookPackGallery({ packs, state, onChange, size = "dialog", onBrowse }: { packs: LookPackCard[]; state: LookPackState; onChange: (patch: Partial<LookPackState>) => void; size?: "dialog" | "page"; /** Opens the presenter library to pick any look as a template. */ onBrowse?: () => void }) {
  const pick = (id: string) => onChange({ packId: id });
  return (
    <div className={`lp-root ${size === "page" ? "lp-page" : ""}`}>
      <div className="lp-controls">
        <div className="pl-segment" role="group" aria-label="Wardrobe variant">{(["female", "male"] as const).map(g => <button type="button" key={g} aria-pressed={state.gender === g} onClick={() => onChange({ gender: g })}>{g === "female" ? "Women's wardrobe" : "Men's wardrobe"}</button>)}</div>
        <div className="pl-segment" role="group" aria-label="Frame">{(["9:16", "16:9"] as const).map(r => <button type="button" key={r} aria-pressed={state.ratio === r} onClick={() => onChange({ ratio: r })}>{r === "9:16" ? "Portrait 9:16" : "Landscape 16:9"}</button>)}</div>
      </div>
      <div className="lp-grid" role="listbox" aria-label="Look packs">
        {packs.map(pk => <div key={pk.id} role="option" tabIndex={0} aria-selected={state.packId === pk.id} className="lp-card" onClick={() => pick(pk.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(pk.id); } }}>
          <span className="lp-swatch lp-preview" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${pk.palette.join(",")})` }}><img src={pk.previews[state.gender]} alt="" loading="lazy" /></span>
          <span className="lp-card-text"><strong>{pk.name}</strong><small>{pk.description}</small></span>
          <span className="lp-card-meta"><span className={`lp-kind ${pk.kind}`}>{pk.kind === "style" ? "Style pack" : "Role pack"}</span><span>{pk.looks} {pk.looks === 1 ? "look" : "looks"}</span></span>
        </div>)}
        {onBrowse && <div role="option" tabIndex={0} aria-selected={state.packId === "remix"} className="lp-card lp-remix" onClick={() => { onChange({ packId: "remix" }); if (!state.remix) onBrowse(); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange({ packId: "remix" }); if (!state.remix) onBrowse(); } }}>
          <span className="lp-swatch lp-preview lp-swatch-remix" aria-hidden="true">{state.remix?.previewUrl ? <img src={state.remix.previewUrl} alt="" /> : <span>↗</span>}</span>
          <span className="lp-card-text"><strong>{state.remix ? `${state.remix.person} · ${state.remix.name}` : "Remix a library look"}</strong><small>{state.remix ? "Your character in this outfit and setting." : "Pick any of the 25,000 presenter looks; HeyGen restyles your character into it."}</small></span>
          <span className="lp-card-meta"><span className="lp-kind remix">Library</span>{state.remix ? <button type="button" className="cs-text-button" onClick={e => { e.stopPropagation(); onBrowse(); }}>Change ↗</button> : <span>2 looks</span>}</span>
        </div>}
        <div role="option" tabIndex={0} aria-selected={state.packId === "prompt"} className="lp-card lp-prompt" onClick={() => pick("prompt")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick("prompt"); } }}>
          <span className="lp-swatch lp-swatch-prompt" aria-hidden="true">Aa</span>
          <span className="lp-card-text"><strong>Your own words</strong><small>Describe an outfit and setting; HeyGen keeps the face.</small></span>
          <span className="lp-card-meta"><span className="lp-kind prompt">Prompt</span><span>1 look</span></span>
        </div>
      </div>
      {state.packId === "prompt" && <div className="cs-form-pair"><label className="cs-field">Look name<input className="cs-input" maxLength={60} value={state.lookName} onChange={e => onChange({ lookName: e.target.value })} placeholder="e.g. Rooftop at dusk" /></label><label className="cs-field">Outfit and setting<input className="cs-input" maxLength={1000} value={state.prompt} onChange={e => onChange({ prompt: e.target.value })} placeholder="Navy blazer, modern office with plants, warm natural light" /></label></div>}
    </div>
  );
}
