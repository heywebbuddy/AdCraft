"use client";
import { useEffect, useRef, useState } from "react";
import type { CatalogVoice, VoiceQuery } from "@adcraft/ai";

export type { CatalogVoice };

type SearchFn = (q: VoiceQuery) => Promise<{ items: CatalogVoice[]; total: number; languages: string[] }>;

/**
 * A voice as a field: name, style and language on one line, a play button for the
 * preview, and "Change" to open the picker. Replaces the raw `<select>`.
 * Styles: workspace.css (.vf-*, .vp-*).
 */
export function VoiceField({ voice, search, onChange, disabled, label = "Voice" }: { voice: CatalogVoice | null; search: SearchFn; onChange: (v: CatalogVoice) => void; disabled?: boolean; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="vf-field">
      <span className="vf-label">{label}</span>
      <div className="vf-row">
        <PlayButton src={voice?.previewUrl} />
        <div className="vf-text">
          <strong>{voice ? voice.name : "Choose a voice"}</strong>
          <small>{voice ? [voice.style, voice.language, voice.provider === "heygen" ? "HeyGen" : "ElevenLabs"].filter(Boolean).join(" · ") : "ElevenLabs and HeyGen voices"}</small>
        </div>
        <button type="button" className="vf-change" disabled={disabled} onClick={() => dialog.current?.showModal()}>
          Change ↗
        </button>
      </div>
      <dialog ref={dialog} className="cs-dialog vp-dialog" aria-labelledby="vp-title" onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
        <VoicePicker search={search} selectedId={voice?.id} initialGender={voice?.gender} onSelect={(v) => { onChange(v); dialog.current?.close(); }} onClose={() => dialog.current?.close()} />
      </dialog>
    </div>
  );
}

/** Search + filter over the whole catalogue (server-side), 60 at a time, with inline previews. */
export function VoicePicker({ search, selectedId, initialGender, onSelect, onClose }: { search: SearchFn; selectedId?: string; initialGender?: "male" | "female"; onSelect: (v: CatalogVoice) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"all" | "female" | "male">(initialGender ?? "all");
  const [language, setLanguage] = useState("");
  const [source, setSource] = useState<"all" | "elevenlabs" | "heygen">("all");
  const [items, setItems] = useState<CatalogVoice[]>([]);
  const [total, setTotal] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      search({ query, gender: gender === "all" ? undefined : gender, language: language || undefined, provider: source === "all" ? undefined : source, offset: 0 })
        .then((r) => {
          if (id !== seq.current) return;
          setItems(r.items);
          setTotal(r.total);
          setLanguages(r.languages);
        })
        .finally(() => id === seq.current && setLoading(false));
    }, query ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, gender, language, source, search]);

  const more = () => {
    const id = ++seq.current;
    search({ query, gender: gender === "all" ? undefined : gender, language: language || undefined, provider: source === "all" ? undefined : source, offset: items.length }).then((r) => {
      if (id !== seq.current) return;
      setItems((prev) => [...prev, ...r.items]);
    });
  };

  return (
    <div className="pl-root">
      <div className="pl-head">
        <div>
          <span className="cs-eyebrow">Voice library</span>
          <h2 id="vp-title">Choose a voice</h2>
          <p>Your ElevenLabs voices plus HeyGen's library — {total.toLocaleString()} {total === 1 ? "match" : "matches"}. Play before you pick.</p>
        </div>
        <button type="button" className="cs-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="pl-filters">
        <input className="cs-input" placeholder="Search by name or style — warm, confident, narrator…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search voices" />
        <div className="pl-segment" role="group" aria-label="Filter by gender">
          {(["all", "female", "male"] as const).map((g) => (
            <button type="button" key={g} aria-pressed={gender === g} onClick={() => setGender(g)}>
              {g === "all" ? "Everyone" : g === "female" ? "Women" : "Men"}
            </button>
          ))}
        </div>
      </div>
      <div className="pl-chips" role="group" aria-label="Source and language">
        {(["all", "elevenlabs", "heygen"] as const).map((s) => (
          <button type="button" key={s} aria-pressed={source === s} onClick={() => setSource(s)}>
            {s === "all" ? "All sources" : s === "elevenlabs" ? "ElevenLabs" : "HeyGen"}
          </button>
        ))}
        <select className="vp-language" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
          <option value="">Any language</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="vp-list" role="listbox" aria-label="Voices">
        {loading && items.length === 0 ? <p className="pl-empty">Loading voices…</p> : null}
        {!loading && items.length === 0 ? <p className="pl-empty">No voices match.</p> : null}
        {items.map((v) => (
          <div key={v.id} role="option" aria-selected={v.id === selectedId} className="vp-row" onClick={() => onSelect(v)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(v); }} tabIndex={0}>
            <PlayButton src={v.previewUrl} active={playing === v.id} onToggle={(on) => setPlaying(on ? v.id : null)} />
            <div className="vp-text">
              <strong>{v.name}</strong>
              <small>{[v.style, v.gender === "female" ? "Woman" : v.gender === "male" ? "Man" : null, v.language, v.accent].filter(Boolean).join(" · ")}</small>
            </div>
            <span className={`vp-source ${v.provider}`}>{v.provider === "heygen" ? "HeyGen" : "ElevenLabs"}</span>
            {v.id === selectedId ? <span className="vp-check">✓</span> : null}
          </div>
        ))}
        {items.length < total ? (
          <button type="button" className="vp-more" onClick={more}>
            Show more · {(total - items.length).toLocaleString()} left
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Round play/pause button that owns one <audio>; only one preview plays at a time per picker. */
function PlayButton({ src, active, onToggle }: { src?: string; active?: boolean; onToggle?: (on: boolean) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const isOn = active ?? on;
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (isOn) void a.play().catch(() => {});
    else {
      a.pause();
      a.currentTime = 0;
    }
  }, [isOn]);
  return (
    <>
      {src ? <audio ref={audio} src={src} preload="none" onEnded={() => { setOn(false); onToggle?.(false); }} /> : null}
      <button
        type="button"
        className="audio-play vf-play"
        disabled={!src}
        aria-label={isOn ? "Pause preview" : "Play preview"}
        aria-pressed={isOn}
        onClick={(e) => {
          e.stopPropagation();
          const next = !isOn;
          setOn(next);
          onToggle?.(next);
        }}
      >
        {isOn ? (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>
    </>
  );
}
