"use client";
import { useEffect, useRef, useState } from "react";
import type { CatalogVoice, VoiceQuery } from "@adcraft/ai";

export type { CatalogVoice };

type SearchFn = (q: VoiceQuery) => Promise<{ items: CatalogVoice[]; total: number; languages: string[] }>;
type AuditionFn = (voiceId: string) => Promise<{ url?: string; error?: string }>;

/**
 * A voice as a field: name, style and language on one line, a play button for the
 * preview, and "Change" to open the picker. Replaces the raw `<select>`.
 * Styles: workspace.css (.vf-*, .vp-*).
 */
export function VoiceField({ voice, search, audition, onChange, disabled, label = "Voice", labelClassName }: { voice: CatalogVoice | null; search: SearchFn; audition?: AuditionFn; onChange: (v: CatalogVoice) => void; disabled?: boolean; label?: string; labelClassName?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="vf-field">
      {label ? <span className={labelClassName ?? "vf-label"}>{label}</span> : null}
      <div className="vf-row">
        <PlayButton src={voice?.previewUrl} />
        <div className="vf-text">
          <strong>{voice ? voice.name : "Choose a voice"}</strong>
          <small>{voice ? [voice.style, voice.language, voice.provider === "heygen" ? "HeyGen" : "ElevenLabs"].filter(Boolean).join(" · ") : "ElevenLabs and HeyGen voices"}</small>
        </div>
        <button type="button" className="vf-change" disabled={disabled} onClick={() => dialog.current?.showModal()}>
          Change ↗︎
        </button>
      </div>
      <dialog ref={dialog} className="cs-dialog vp-dialog" aria-labelledby="vp-title" onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
        <VoicePicker search={search} audition={audition} selectedId={voice?.id} initialGender={voice?.gender} onSelect={(v) => { onChange(v); dialog.current?.close(); }} onClose={() => dialog.current?.close()} />
      </dialog>
    </div>
  );
}

/** Search + filter over the whole catalogue (server-side), 60 at a time, with inline previews. */
export function VoicePicker({ search, audition, selectedId, initialGender, onSelect, onClose, mode = "dialog", stats }: { search: SearchFn; audition?: AuditionFn; selectedId?: string; initialGender?: "male" | "female"; onSelect: (v: CatalogVoice) => void; onClose?: () => void; /** "page" renders as a browsable section (no close, page scroll, two columns). */ mode?: "dialog" | "page"; /** Catalogue totals for the page header. */ stats?: { elevenlabs: number; heygen: number; languages: number } }) {
  const page = mode === "page";
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"all" | "female" | "male">(initialGender ?? "all");
  const [language, setLanguage] = useState("");
  const [source, setSource] = useState<"all" | "elevenlabs" | "heygen">("all");
  const [items, setItems] = useState<CatalogVoice[]>([]);
  const [total, setTotal] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [auditionError, setAuditionError] = useState<string | null>(null);
  const seq = useRef(0);

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // After a few seconds of loading, say why: the first load after a deploy reads the whole library.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 4_000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    setFailed(false);
    const run = (retry: number) =>
      Promise.race([
        search({ query, gender: gender === "all" ? undefined : gender, language: language || undefined, provider: source === "all" ? undefined : source, offset: 0 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60_000)),
      ])
        .then((r) => {
          if (id !== seq.current) return;
          setItems(r.items);
          setTotal(r.total);
          setLanguages(r.languages);
          setLoading(false);
        })
        .catch(() => {
          if (id !== seq.current) return;
          // A server action can be aborted by a concurrent navigation, and the very first load
          // after a deploy fetches the whole library; retry quietly before saying so.
          if (retry > 0) setTimeout(() => id === seq.current && run(retry - 1), 800);
          else { setFailed(true); setLoading(false); }
        });
    const t = setTimeout(() => run(2), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, gender, language, source, search, attempt]);

  const more = () => {
    const id = ++seq.current;
    search({ query, gender: gender === "all" ? undefined : gender, language: language || undefined, provider: source === "all" ? undefined : source, offset: items.length })
      .then((r) => {
        if (id !== seq.current) return;
        setItems((prev) => [...prev, ...r.items]);
      })
      .catch(() => undefined);
  };

  return (
    <div className={`pl-root ${page ? "pl-page" : ""}`}>
      <div className="pl-head">
        <div>
          <span className="cs-eyebrow">Voice library</span>
          <h2 id={page ? undefined : "vp-title"}>{page ? "Browse voices" : "Choose a voice"}</h2>
          <p>{page ? `Your ElevenLabs voices plus HeyGen's library across ${languages.length || stats?.languages || "many"} languages${loading && items.length === 0 ? "" : ` — ${total.toLocaleString()} ${total === 1 ? "match" : "matches"}`}. Play a sample, then use the voice in an ad or give it to a character.` : `Your ElevenLabs voices plus HeyGen's library${loading && items.length === 0 ? "" : ` — ${total.toLocaleString()} ${total === 1 ? "match" : "matches"}`}. Play before you pick.`}</p>
        </div>
        {page && stats ? (
          <dl className="pl-stats" aria-label="Catalogue breakdown">
            <button type="button" className="pl-stat" aria-pressed={source === "elevenlabs"} onClick={() => setSource(source === "elevenlabs" ? "all" : "elevenlabs")}><dt>ElevenLabs</dt><dd>{stats.elevenlabs.toLocaleString()}</dd></button>
            <button type="button" className="pl-stat" aria-pressed={source === "heygen"} onClick={() => setSource(source === "heygen" ? "all" : "heygen")}><dt>HeyGen</dt><dd>{stats.heygen.toLocaleString()}</dd></button>
            <div className="pl-stat pl-stat-static"><dt>Languages</dt><dd>{stats.languages.toLocaleString()}</dd></div>
          </dl>
        ) : page ? null : <button type="button" className="cs-close" onClick={onClose} aria-label="Close">×</button>}
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
      <div className={`vp-list ${page ? "vp-columns" : ""}`} role="listbox" aria-label="Voices">
        {loading && items.length === 0 ? <p className="pl-empty">{slow ? "Loading the voice library — the first load after an update can take up to a minute…" : "Loading voices…"}</p> : null}
        {!loading && failed ? <p className="pl-empty" role="alert">Couldn't load voices. <button type="button" className="cs-text-button vp-retry" onClick={() => setAttempt((n) => n + 1)}>Try again</button></p> : null}
        {!loading && !failed && items.length === 0 ? <p className="pl-empty">No voices match.</p> : null}
        {items.map((v) => (
          <div key={v.id} role="option" aria-selected={v.id === selectedId} className="vp-row" onClick={() => onSelect(v)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(v); }} tabIndex={0}>
            {v.previewUrl || samples[v.id] ? (
              <PlayButton src={samples[v.id] ?? v.previewUrl} active={playing === v.id} onToggle={(on) => setPlaying(on ? v.id : null)} />
            ) : v.status === "processing" ? (
              <span className="vp-nosample" title="Training on HeyGen">…</span>
            ) : audition && v.provider === "heygen" && !v.owned ? (
              <button
                type="button"
                className="vp-audition"
                disabled={auditioning === v.id}
                title="HeyGen has no sample for this voice. Generate a 4-second one (a fraction of a credit, kept for everyone)."
                onClick={(e) => {
                  e.stopPropagation();
                  setAuditioning(v.id);
                  setAuditionError(null);
                  audition(v.id)
                    .then((r) => {
                      if (r.url) {
                        setSamples((prev) => ({ ...prev, [v.id]: r.url! }));
                        setPlaying(v.id);
                      } else setAuditionError(r.error ?? "Could not generate a sample.");
                    })
                    .finally(() => setAuditioning(null));
                }}
              >
                {auditioning === v.id ? "…" : "Audition"}
              </button>
            ) : (
              <span className="vp-nosample" title="No sample available">—</span>
            )}
            <div className="vp-text">
              <strong>{v.name}</strong>
              <small>{[v.style, v.gender === "female" ? "Woman" : v.gender === "male" ? "Man" : null, v.language, v.accent].filter(Boolean).join(" · ")}{v.status === "processing" ? " · still training" : v.status === "failed" ? " · clone failed" : !v.previewUrl && !samples[v.id] ? " · no sample yet" : ""}</small>
            </div>
            <span className={`vp-source ${v.owned ? `owned ${v.owned}` : v.provider}`}>{v.owned === "clone" ? "Your clone" : v.owned === "designed" ? "Designed" : v.provider === "heygen" ? "HeyGen" : "ElevenLabs"}</span>
            {v.id === selectedId ? <span className="vp-check">✓</span> : null}
          </div>
        ))}
        {auditionError ? <p className="pl-empty" role="alert">{auditionError}</p> : null}
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
export function PlayButton({ src, active, onToggle }: { src?: string; active?: boolean; onToggle?: (on: boolean) => void }) {
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
