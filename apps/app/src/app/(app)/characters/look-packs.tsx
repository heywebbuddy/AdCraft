"use client";

export type LookPackCard = { id: string; name: string; kind: "style" | "role"; description: string; palette: [string, string, string]; looks: number; type: "look_pack" | "template" };

export type LookPackState = {
  packId: string;
  gender: "female" | "male";
  ratio: "16:9" | "9:16";
  prompt: string;
  lookName: string;
};

/**
 * HeyGen look packs as a gallery: wardrobe variant, frame, the pack cards (palettes stand
 * in for previews — HeyGen exposes none over the API) and "your own words" for a prompt
 * look. Shared by the Design-a-look page and the new-look dialog. Styles: studio.css (.lp-*).
 */
export function LookPackGallery({ packs, state, onChange, size = "dialog" }: { packs: LookPackCard[]; state: LookPackState; onChange: (patch: Partial<LookPackState>) => void; size?: "dialog" | "page" }) {
  const pick = (id: string) => onChange({ packId: id });
  return (
    <div className={`lp-root ${size === "page" ? "lp-page" : ""}`}>
      <div className="lp-controls">
        <div className="pl-segment" role="group" aria-label="Wardrobe variant">{(["female", "male"] as const).map(g => <button type="button" key={g} aria-pressed={state.gender === g} onClick={() => onChange({ gender: g })}>{g === "female" ? "Women's wardrobe" : "Men's wardrobe"}</button>)}</div>
        <div className="pl-segment" role="group" aria-label="Frame">{(["9:16", "16:9"] as const).map(r => <button type="button" key={r} aria-pressed={state.ratio === r} onClick={() => onChange({ ratio: r })}>{r === "9:16" ? "Portrait 9:16" : "Landscape 16:9"}</button>)}</div>
      </div>
      <div className="lp-grid" role="listbox" aria-label="Look packs">
        {packs.map(pk => <div key={pk.id} role="option" tabIndex={0} aria-selected={state.packId === pk.id} className="lp-card" onClick={() => pick(pk.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(pk.id); } }}>
          <span className="lp-swatch" aria-hidden="true">{pk.palette.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
          <span className="lp-card-text"><strong>{pk.name}</strong><small>{pk.description}</small></span>
          <span className="lp-card-meta"><span className={`lp-kind ${pk.kind}`}>{pk.kind === "style" ? "Style pack" : "Role pack"}</span><span>{pk.looks} {pk.looks === 1 ? "look" : "looks"}</span></span>
        </div>)}
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
