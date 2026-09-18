"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { VoiceField, type CatalogVoice } from "@/components/voice-picker";
import { auditionVoiceAction, createAvatarAction, searchVoicesAction } from "./actions";

/**
 * "Create an avatar" — two ways to bring a character onto HeyGen:
 *  - Clone a real person: footage → digital twin (+ voice cloned from the footage, + consent).
 *  - Create a virtual character: a photo or a description → photo / prompt avatar.
 * Styles: studio.css (.ac-*).
 */
export function AvatarCreate({ canEdit, connected, balance, credits, defaultVoice, onCreated }: { canEdit: boolean; connected: boolean; balance: number; credits: { digitalTwin: number; heygenAvatar: number }; defaultVoice: CatalogVoice | null; onCreated: (id: string) => void }) {
  const twinDialog = useRef<HTMLDialogElement>(null);
  const virtualDialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="ac-cards">
        <button type="button" className="ac-card" disabled={!canEdit || !connected} onClick={() => twinDialog.current?.showModal()}>
          <span className="ac-art ac-art-twin" aria-hidden="true">
            <img src="https://resource2.heygen.ai/avatar_remix_template/modern_corporate_female/profile.png" alt="" loading="lazy" />
            <img src="https://resource2.heygen.ai/avatar_remix_template/cool_tech_slate_male/profile.png" alt="" loading="lazy" />
            <img src="https://resource2.heygen.ai/avatar_remix_template/stylish_business_casual_female/profile.png" alt="" loading="lazy" />
          </span>
          <span className="ac-card-text">
            <span className="ac-card-title"><strong>Clone a real person</strong><span className="ac-badge">Avatar V</span></span>
            <small>Upload real footage. HeyGen trains a twin that looks, moves and sounds like them — voice included.</small>
            <span className="ac-card-meta">{credits.digitalTwin} credits · consent recorded by the person</span>
          </span>
        </button>
        <button type="button" className="ac-card" disabled={!canEdit || !connected} onClick={() => virtualDialog.current?.showModal()}>
          <span className="ac-art ac-art-virtual" aria-hidden="true">
            <img src="https://resource2.heygen.ai/avatar_remix_template/keynote_power_presenter_female/profile.png" alt="" loading="lazy" />
            <img src="https://resource2.heygen.ai/avatar_remix_template/healthcare_male_ren/profile.png" alt="" loading="lazy" />
            <img src="https://resource2.heygen.ai/avatar_remix_template/fitness_nutrition_female/profile.png" alt="" loading="lazy" />
          </span>
          <span className="ac-card-text">
            <span className="ac-card-title"><strong>Create a virtual character</strong></span>
            <small>Start with a photo or a description, and bring it to life with motion and a voice of your choice.</small>
            <span className="ac-card-meta">{credits.heygenAvatar} credits · no consent step</span>
          </span>
        </button>
      </div>
      {!connected && <p className="cs-modal-note">Connect HeyGen to create avatars.</p>}
      <TwinDialog ref={twinDialog} balance={balance} credits={credits.digitalTwin} onCreated={onCreated} />
      <VirtualDialog ref={virtualDialog} balance={balance} credits={credits.heygenAvatar} defaultVoice={defaultVoice} onCreated={onCreated} />
    </>
  );
}

/** Upload through /api/uploads (server actions cap at 16 MB) and return the storage key. */
async function upload(file: File, onProgress: (pct: number) => void): Promise<{ key: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { key?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.key) resolve({ key: body.key });
        else reject(new Error(body.error ?? `Upload failed (${xhr.status}).`));
      } catch { reject(new Error(`Upload failed (${xhr.status}).`)); }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    const form = new FormData();
    form.set("file", file);
    xhr.send(form);
  });
}

function FileDrop({ file, onFile, accept, label, hint }: { file: File | null; onFile: (f: File | null) => void; accept: string; label: string; hint: string }) {
  return (
    <label className={`vt-drop ${file ? "has-file" : ""}`}>
      <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · click to change</small></> : <><strong>{label}</strong><small>{hint}</small></>}
    </label>
  );
}

function TwinDialog({ ref, balance, credits, onCreated }: { ref: React.RefObject<HTMLDialogElement | null>; balance: number; credits: number; onCreated: (id: string) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const close = () => { if (pending) return; ref.current?.close(); setFile(null); setProgress(null); setError(""); form.current?.reset(); };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    const data = new FormData(e.currentTarget);
    setError("");
    // Upload outside the transition so progress renders as it happens; the action runs inside it.
    void (async () => {
      let key: string;
      try {
        setProgress(0);
        ({ key } = await upload(file, setProgress));
      } catch (err) { setProgress(null); setError(err instanceof Error ? err.message : "Upload failed."); return; }
      setProgress(null);
      data.set("type", "digital_twin");
      data.set("sourceKey", key);
      start(async () => {
        const r = await createAvatarAction(data);
        if (r.error || !r.id) { setError(r.error ?? "Could not start the twin."); return; }
        onCreated(r.id);
        ref.current?.close(); setFile(null); form.current?.reset(); router.refresh();
      });
    })();
  };
  return (
    <dialog ref={ref} className="cs-dialog vt-dialog" aria-labelledby="ac-twin-title" onCancel={(e) => { if (pending) e.preventDefault(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cs-dialog-heading"><div><span className="cs-eyebrow">HeyGen digital twin</span><h2 id="ac-twin-title">Clone a real person</h2><p>One person, facing the camera, speaking naturally for 15 seconds to 10 minutes. HeyGen trains the twin and clones their voice from the same recording.</p></div><button type="button" className="cs-close" aria-label="Close" disabled={pending} onClick={close}>×</button></div>
      <form ref={form} onSubmit={submit} className="cs-character-form">
        <div className="cs-form-pair">
          <label className="cs-field">Character name<input className="cs-input" name="name" required maxLength={60} placeholder="e.g. Priya" /></label>
          <label className="cs-field">Personality<input className="cs-input" name="personality" maxLength={300} defaultValue="Warm and conversational" /></label>
        </div>
        <FileDrop file={file} onFile={setFile} accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" label="Choose the footage" hint="mp4 or mov · 15 s – 10 min · up to 600 MB · face in frame throughout" />
        <ul className="ac-tips"><li>Even lighting, a plain background, the whole head in frame.</li><li>Natural pauses and hand movement give the twin more to learn from.</li><li>Clear speech — the voice is cloned from this audio.</li></ul>
        <label className="vt-consent"><input type="checkbox" name="consent" value="yes" required /> The person in this footage has agreed to be cloned. HeyGen will send them a link to record a short consent statement before the twin can be used.</label>
        {progress !== null && <div className="ac-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /><small>Uploading… {progress}%</small></div>}
        {error ? <p className="cs-error" role="alert">{error}</p> : null}
        <div className="cs-dialog-footer"><span>{credits} credits · {balance} available · training takes a while</span><button type="submit" className="cs-primary" disabled={pending || progress !== null || !file || balance < credits}>{progress !== null ? "Uploading…" : pending ? "Starting…" : "Train the twin ↗"}</button></div>
      </form>
    </dialog>
  );
}

function VirtualDialog({ ref, balance, credits, defaultVoice, onCreated }: { ref: React.RefObject<HTMLDialogElement | null>; balance: number; credits: number; defaultVoice: CatalogVoice | null; onCreated: (id: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"photo" | "prompt">("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [voice, setVoice] = useState<CatalogVoice | null>(defaultVoice);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const pickFile = (f: File | null) => { setFile(f); if (preview) URL.revokeObjectURL(preview); setPreview(f ? URL.createObjectURL(f) : null); };
  const close = () => { if (pending) return; ref.current?.close(); pickFile(null); setProgress(null); setError(""); form.current?.reset(); };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("type", mode);
    data.set("voiceId", voice?.id ?? "");
    setError("");
    void (async () => {
      if (mode === "photo") {
        if (!file) { setError("Add a photo."); return; }
        try {
          setProgress(0);
          const { key } = await upload(file, setProgress);
          data.set("sourceKey", key);
        } catch (err) { setProgress(null); setError(err instanceof Error ? err.message : "Upload failed."); return; }
        setProgress(null);
      }
      start(async () => {
        const r = await createAvatarAction(data);
        if (r.error || !r.id) { setError(r.error ?? "Could not create the character."); return; }
        onCreated(r.id);
        ref.current?.close(); pickFile(null); form.current?.reset(); router.refresh();
      });
    })();
  };
  return (
    <dialog ref={ref} className="cs-dialog vt-dialog" aria-labelledby="ac-virtual-title" onCancel={(e) => { if (pending) e.preventDefault(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cs-dialog-heading"><div><span className="cs-eyebrow">HeyGen virtual character</span><h2 id="ac-virtual-title">Create a virtual character</h2><p>Start from one photo, or describe someone who doesn't exist. The result is a HeyGen avatar with Avatar V motion, ready for looks and ads.</p></div><button type="button" className="cs-close" aria-label="Close" disabled={pending} onClick={close}>×</button></div>
      <form ref={form} onSubmit={submit} className="cs-character-form">
        <div className="cs-source" role="tablist" aria-label="Start from">
          <button type="button" role="tab" aria-selected={mode === "photo"} onClick={() => setMode("photo")}>From a photo</button>
          <button type="button" role="tab" aria-selected={mode === "prompt"} onClick={() => setMode("prompt")}>From a description</button>
        </div>
        <div className="cs-form-pair">
          <label className="cs-field">Character name<input className="cs-input" name="name" required maxLength={60} placeholder="e.g. Maya" /></label>
          <label className="cs-field">Personality<input className="cs-input" name="personality" maxLength={300} defaultValue="Warm and conversational" /></label>
        </div>
        {mode === "photo" ? (
          <div className="ac-photo-row">
            {preview && <img className="ac-photo-preview" src={preview} alt="" />}
            <FileDrop file={file} onFile={pickFile} accept="image/png,image/jpeg,image/webp" label="Choose a photo" hint="Front-facing, whole head in frame, even light · png or jpg" />
          </div>
        ) : (
          <label className="cs-field">Describe the character<textarea className="cs-input" name="prompt" rows={3} minLength={15} maxLength={1000} required placeholder="Woman in her early 30s, confident expression, short silver hair, dark blue flight suit, spacecraft bridge with holographic displays, cinematic lighting" /></label>
        )}
        <div className="cs-field"><VoiceField voice={voice} search={searchVoicesAction} audition={auditionVoiceAction} onChange={setVoice} label="Voice" labelClassName="cs-field-label" /></div>
        {progress !== null && <div className="ac-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /><small>Uploading… {progress}%</small></div>}
        {error ? <p className="cs-error" role="alert">{error}</p> : null}
        <div className="cs-dialog-footer"><span>{credits} credits · {balance} available</span><button type="submit" className="cs-primary" disabled={pending || progress !== null || balance < credits || (mode === "photo" && !file) || !voice}>{progress !== null ? "Uploading…" : pending ? "Creating…" : "Create character ↗"}</button></div>
      </form>
    </dialog>
  );
}
