"use client";
import { useFileDrop } from "@/lib/file-drop";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Spark } from "@/components/spark";
import { PlayButton, type CatalogVoice } from "@/components/voice-picker";
import { brandVoicesAction, cloneVoiceAction, deleteBrandVoiceAction, designVoicesAction, discardDesignedVoicesAction, keepDesignedVoiceAction, type DesignedVoice } from "./actions";

/**
 * The top of the Voice library: make a voice (clone a recording, or design one from a
 * description) and the workspace's own voices. Both run on HeyGen and become private
 * voices scoped to this brand. Styles: studio.css (.vt-*).
 */
export function VoiceTools({ voices: initial, canEdit, onUse }: { voices: CatalogVoice[]; canEdit: boolean; onUse: (v: CatalogVoice) => void }) {
  const router = useRouter();
  const [voices, setVoices] = useState(initial);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cloneDialog = useRef<HTMLDialogElement>(null);
  const designDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => setVoices(initial), [initial]);

  // Clones train for a short while: poll until none are processing.
  const training = voices.some((v) => v.status === "processing");
  useEffect(() => {
    if (!training) return;
    const t = setInterval(() => brandVoicesAction().then(setVoices).catch(() => undefined), 5000);
    return () => clearInterval(t);
  }, [training]);

  const remove = (v: CatalogVoice) => {
    if (!confirm(`Delete “${v.name}”? This also removes it from HeyGen.`)) return;
    setError("");
    deleteBrandVoiceAction(v.id).then((r) => {
      if (r.error) setError(r.error);
      else { setVoices((prev) => prev.filter((x) => x.id !== v.id)); router.refresh(); }
    });
  };

  return (
    <section className="vt-root" aria-label="Your voices">
      <div className="vt-actions">
        <button type="button" className="vt-action" disabled={!canEdit} onClick={() => cloneDialog.current?.showModal()}>
          <span className="vt-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></svg>
          </span>
          <span className="vt-action-text"><strong>Clone your voice</strong><small>One clear recording, a minute or two. Ready in about a minute.</small></span>
          <span className="vt-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" className="vt-action" disabled={!canEdit} onClick={() => designDialog.current?.showModal()}>
          <span className="vt-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m4 20 10.5-10.5M13 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6zM6 4l.5 1 1 .5-1 .5L6 7l-.5-1-1-.5 1-.5z" /></svg>
          </span>
          <span className="vt-action-text"><strong>Design a voice</strong><small>Describe tone, age, accent and pace; pick from three matches.</small></span>
          <span className="vt-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      {voices.length > 0 && (
        <div className="vt-own">
          <div className="vt-own-head"><h3>Your voices</h3><span>{voices.length} · private to this brand</span></div>
          <div className="vt-own-list">
            {voices.map((v) => (
              <div key={v.id} className={`vt-voice ${v.status ?? "ready"}`}>
                {v.status === "processing" ? <span className="vt-training" title="HeyGen is training this voice"><Spark size={16} animate="spin" /></span> : v.status === "failed" ? <span className="vt-failed" title="Failed">!</span> : <PlayButton src={v.previewUrl} active={playing === v.id} onToggle={(on) => setPlaying(on ? v.id : null)} />}
                <div className="vp-text">
                  <strong>{v.name}</strong>
                  <small>{v.status === "processing" ? "Training on HeyGen — usually under a minute" : v.status === "failed" ? "Cloning failed. Try a cleaner recording." : [v.gender === "female" ? "Woman" : v.gender === "male" ? "Man" : null, v.language].filter(Boolean).join(" · ") || "Ready"}</small>
                </div>
                <span className={`vp-source owned ${v.owned}`}>{v.owned === "clone" ? "Clone" : "Designed"}</span>
                <button type="button" className="cs-text-button vt-use" disabled={v.status !== undefined || !canEdit} onClick={() => onUse(v)}>Use ↗︎</button>
                <button type="button" className="vt-delete" aria-label={`Delete ${v.name}`} disabled={!canEdit} onClick={() => remove(v)}>×</button>
              </div>
            ))}
          </div>
          {error ? <p className="cs-error" role="alert">{error}</p> : null}
        </div>
      )}

      <CloneDialog ref={cloneDialog} onCreated={(v) => { setVoices((prev) => [...prev, v]); router.refresh(); }} />
      <DesignDialog ref={designDialog} onKept={(v) => { setVoices((prev) => [...prev, v]); router.refresh(); }} />
    </section>
  );
}

const LANGUAGES: Array<[string, string]> = [["", "Detect automatically"], ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["hi", "Hindi"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["ar", "Arabic"]];

function CloneDialog({ ref, onCreated }: { ref: React.RefObject<HTMLDialogElement | null>; onCreated: (v: CatalogVoice) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const drop = useFileDrop();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const close = () => { ref.current?.close(); setFile(null); setError(""); form.current?.reset(); };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (file) data.set("audio", file);
    setError("");
    start(async () => {
      const r = await cloneVoiceAction(data);
      if (r.error || !r.voice) { setError(r.error ?? "Could not start the clone."); return; }
      onCreated(r.voice);
      close();
    });
  };
  return (
    <dialog ref={ref} className="cs-dialog vt-dialog" aria-labelledby="vt-clone-title" onCancel={(e) => { if (pending) e.preventDefault(); }} onClick={(e) => { if (e.target === e.currentTarget && !pending) close(); }}>
      <div className="cs-dialog-heading"><div><span className="cs-eyebrow">HeyGen instant clone</span><h2 id="vt-clone-title">Clone your voice</h2><p>Upload one recording of a single speaker. Sixty seconds to two minutes of natural speech, no music, little background noise.</p></div><button type="button" className="cs-close" aria-label="Close" disabled={pending} onClick={close}>×</button></div>
      <form ref={form} onSubmit={submit} className="cs-character-form">
        <div className="cs-form-pair">
          <label className="cs-field">Voice name<input className="cs-input" name="name" required maxLength={60} placeholder="e.g. Priya — brand voice" /></label>
          <label className="cs-field">Language<select className="cs-input" name="language" defaultValue="">{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <label className={`vt-drop ${file ? "has-file" : ""} ${drop.over ? "is-over" : ""}`} {...drop.props}>
          <input type="file" name="audio" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · click or drop to change</small></> : <><strong>{drop.over ? "Drop it here" : "Choose a recording"}</strong><small>mp3, wav or m4a · up to 10 MB</small><small className="vt-drop-or">or drag the file onto this box</small></>}
        </label>
        <label className="vt-consent"><input type="checkbox" name="consent" value="yes" required /> I have this person's permission to clone their voice, and I will use it responsibly.</label>
        {error ? <p className="cs-error" role="alert">{error}</p> : null}
        <div className="cs-dialog-footer"><span>No Adcraft credits · uses one HeyGen voice slot</span><button type="submit" className="cs-primary" disabled={pending || !file}>{pending ? "Uploading…" : "Clone voice ↗︎"}</button></div>
      </form>
    </dialog>
  );
}

function DesignDialog({ ref, onKept }: { ref: React.RefObject<HTMLDialogElement | null>; onKept: (v: CatalogVoice) => void }) {
  const [prompt, setPrompt] = useState("");
  const [gender, setGender] = useState<"" | "female" | "male">("");
  const [results, setResults] = useState<DesignedVoice[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const close = () => {
    ref.current?.close();
    // Nothing kept: free the HeyGen slots this session created.
    if (seen.length) void discardDesignedVoicesAction(seen);
    setResults([]); setSeen([]); setSeed(0); setChosen(null); setName(""); setError(""); setNote(""); setPlaying(null);
  };
  const find = (nextSeed: number) => {
    setError(""); setNote(""); setChosen(null);
    start(async () => {
      const r = await designVoicesAction({ prompt, gender: gender || undefined, seed: nextSeed });
      if (r.error) { setError(r.error); return; }
      const voices = r.voices ?? [];
      // Previous batch is superseded: drop it on HeyGen.
      const previous = results.map((v) => v.voiceId);
      if (previous.length) void discardDesignedVoicesAction(previous);
      setSeen((prev) => [...prev.filter((id) => !previous.includes(id)), ...voices.map((v) => v.voiceId)]);
      setResults(voices);
      setSeed(nextSeed);
      if (!voices.length) setNote("HeyGen found no voices for that description. Add detail — tone, age, accent, pace and what it is for — or try another phrasing.");
    });
  };
  const keep = (v: DesignedVoice) => {
    setError("");
    start(async () => {
      const r = await keepDesignedVoiceAction({ keep: v, name: name.trim() || v.name, prompt, discard: results.map((x) => x.voiceId).filter((id) => id !== v.voiceId) });
      if (r.error || !r.voice) { setError(r.error ?? "Could not save the voice."); return; }
      onKept(r.voice);
      setSeen([]); setResults([]);
      close();
    });
  };
  return (
    <dialog ref={ref} className="cs-dialog vt-dialog" aria-labelledby="vt-design-title" onCancel={(e) => { e.preventDefault(); if (!pending) close(); }} onClick={(e) => { if (e.target === e.currentTarget && !pending) close(); }}>
      <div className="cs-dialog-heading"><div><span className="cs-eyebrow">HeyGen voice design</span><h2 id="vt-design-title">Design a voice</h2><p>Describe the voice like you would brief a voice actor. HeyGen returns up to three; keep the one that fits.</p></div><button type="button" className="cs-close" aria-label="Close" disabled={pending} onClick={close}>×</button></div>
      <div className="cs-character-form">
        <label className="cs-field">Description<textarea className="cs-input" rows={3} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A warm, confident male voice with a slight British accent. Deep baritone, measured pace, suited to tech product narration." /></label>
        <div className="cs-field-row vt-design-row">
          <div className="pl-segment" role="group" aria-label="Gender">
            {(["", "female", "male"] as const).map((g) => <button type="button" key={g} aria-pressed={gender === g} onClick={() => setGender(g)}>{g === "" ? "Any" : g === "female" ? "Woman" : "Man"}</button>)}
          </div>
          <button type="button" className="cs-secondary" disabled={pending || prompt.trim().length < 20} onClick={() => find(0)}>{pending && !results.length ? "Designing…" : "Find voices ↗︎"}</button>
        </div>
        {note ? <p className="cs-modal-note" role="status">{note}</p> : null}
        {results.length > 0 && (
          <div className="vt-results">
            <label className="cs-field">Save as<input className="cs-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={chosen ? results.find((r) => r.voiceId === chosen)?.name : "Name for the voice you keep (optional)"} /></label>
            <div className="vt-own-list">
              {results.map((v) => (
                <div key={v.voiceId} className={`vt-voice ${chosen === v.voiceId ? "chosen" : ""}`} onClick={() => setChosen(v.voiceId)}>
                  <PlayButton src={v.previewUrl} active={playing === v.voiceId} onToggle={(on) => setPlaying(on ? v.voiceId : null)} />
                  <div className="vp-text"><strong>{v.name}</strong><small>{[v.gender === "female" ? "Woman" : v.gender === "male" ? "Man" : null, v.language].filter(Boolean).join(" · ") || "Designed"}</small></div>
                  <button type="button" className="cs-primary vt-keep" disabled={pending} onClick={(e) => { e.stopPropagation(); keep(v); }}>Keep this voice</button>
                </div>
              ))}
            </div>
            <button type="button" className="cs-text-button vt-more" disabled={pending} onClick={() => find(seed + 1)}>{pending ? "Designing…" : "Show three more ↗︎"}</button>
          </div>
        )}
        {error ? <p className="cs-error" role="alert">{error}</p> : null}
        <div className="cs-dialog-footer"><span>No Adcraft credits · the voice you keep uses one HeyGen voice slot; the others are removed</span><button type="button" className="cs-secondary" disabled={pending} onClick={close}>Close</button></div>
      </div>
    </dialog>
  );
}
