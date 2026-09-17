"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CharacterStudioData } from "@/server/character-studio";
import { CHARACTER_TEMPLATES, estimatedStudioSeconds, hookVariations, studioScript, type CharacterTemplateId } from "@/lib/character-studio";
import { createCharacterAdAction, generateCharacterAction, saveCharacterAction } from "./actions";
import { Spark } from "@/components/spark";
import { MakerLogo, inferMaker } from "@/components/maker-logo";
import { AudioPreview } from "@/components/audio-preview";

type Props = { data: CharacterStudioData; brandName: string; balance: number; videoCredits: number; canEdit: boolean; planEnabled: boolean };
type View = "studio" | "characters" | "templates";

export function CharacterStudio({ data, brandName, balance, videoCredits, canEdit, planEnabled }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("studio");
  const [characterId, setCharacterId] = useState(data.characters.find(c => c.portraitUrl)?.id ?? data.characters[0]?.id ?? "");
  const character = data.characters.find(c => c.id === characterId) ?? data.characters[0];
  const [lookId, setLookId] = useState("");
  const look = character?.looks.find(l => l.id === lookId) ?? character?.looks[0];
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const product = data.products.find(p => p.id === productId);
  const [serviceName, setServiceName] = useState("");
  const name = product?.name || serviceName || "your product";
  const [template, setTemplate] = useState<CharacterTemplateId>("introduction");
  const [hook, setHook] = useState(hookVariations(name, "introduction")[0]!);
  const [body, setBody] = useState(data.products[0]?.description ?? "");
  const [cta, setCta] = useState("Explore the collection.");
  const [ratio, setRatio] = useState("9:16");
  const [scene, setScene] = useState(0);
  const [showHooks, setShowHooks] = useState(false);
  const initialModel = data.models.find(m => m.connected && m.enabled && m.default) ?? data.models.find(m => m.connected && m.enabled) ?? data.models[0];
  const [portraitModel, setPortraitModel] = useState(initialModel?.id ?? "");
  const [sceneModel, setSceneModel] = useState(initialModel?.id ?? "");
  const [videoModel, setVideoModel] = useState(data.videoModels.find(m => m.default)?.id ?? data.videoModels[0]?.id ?? "");
  const [modelTarget, setModelTarget] = useState<"portrait" | "scene">("portrait");
  const [dialogMode, setDialogMode] = useState<"new" | "look" | "profile">("new");
  const [voiceId, setVoiceId] = useState(data.voices[0]?.id ?? "");
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [modalPending, startModal] = useTransition();
  const characterDialog = useRef<HTMLDialogElement>(null);
  const modelDialog = useRef<HTMLDialogElement>(null);
  const characterForm = useRef<HTMLFormElement>(null);
  const busy = data.characters.some(c => c.status === "queued" || c.status === "generating");
  useEffect(() => { if (!busy) return; const interval = setInterval(() => router.refresh(), 4000); return () => clearInterval(interval); }, [busy, router]);
  const selectedPortraitModel = data.models.find(m => m.id === portraitModel);
  const selectedSceneModel = data.models.find(m => m.id === sceneModel);
  const script = studioScript(hook, body, cta);
  const words = script.split(/\s+/).filter(Boolean).length;
  const seconds = estimatedStudioSeconds(script);
  const voice = data.voices.find(v => v.id === (character?.voiceId ?? voiceId));
  const modalVoice = data.voices.find(v => v.id === voiceId);
  const previewUrl = scene === 0 ? look?.url : product?.imageUrl;
  const previewCaption = [hook, product?.name || serviceName || "Your product", body || "Your product message", cta][scene];
  const canGenerate = canEdit && data.videoConnected && !!look && !!body.trim() && !!hook.trim() && !!cta.trim() && !!(product || serviceName.trim()) && words <= 75 && balance >= videoCredits && selectedSceneModel?.connected && selectedSceneModel.enabled && !!videoModel;

  function pickTemplate(id: CharacterTemplateId) { setTemplate(id); setHook(hookVariations(name, id)[0]!); setScene(0); }
  function pickProduct(id: string) { setProductId(id); const item = data.products.find(p => p.id === id); setBody(item?.description ?? ""); setHook(hookVariations(item?.name || serviceName || "your service", template)[0]!); }
  function openCharacter(mode: "new" | "look" | "profile") {
    setDialogMode(mode); setModalError(""); setVoiceId(mode === "new" ? data.voices[0]?.id ?? "" : character?.voiceId ?? "");
    characterDialog.current?.showModal();
  }
  function openModels(target: "portrait" | "scene") { setModelTarget(target); modelDialog.current?.showModal(); }
  function submitCharacter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); form.set("imageModel", portraitModel); form.set("voiceId", voiceId);
    if (dialogMode !== "new" && character) form.set("characterId", character.id);
    setModalError("");
    startModal(async () => {
      try {
        const result = dialogMode === "profile" ? await saveCharacterAction(form) : await generateCharacterAction(form);
        if (result.error) { setModalError(result.error); return; }
        if ("id" in result && typeof result.id === "string") setCharacterId(result.id);
        setNotice(dialogMode === "profile" ? "Character profile saved." : "Your look is generating. You can keep working while it finishes.");
        characterDialog.current?.close(); router.refresh();
      } catch { setModalError("Could not reach the server. Please try again."); }
    });
  }
  function createAd() {
    setError("");
    const form = new FormData();
    Object.entries({ characterId: character?.id ?? "", lookId: look?.id ?? "", productId, serviceName, templateId: template, hook, body, cta, ratio, videoModel, imageModel: sceneModel }).forEach(([key, value]) => form.set(key, value));
    start(async () => {
      try { const result = await createCharacterAdAction(form); if (result.error) setError(result.error); else if (result.creativeId) router.push(`/videos/${result.creativeId}`); }
      catch { setError("Could not start the ad. Please try again."); }
    });
  }

  return <div className="character-studio">
    <header className="cs-header"><div><span className="cs-eyebrow">{brandName} / Character studio</span><h1>A familiar face.<br /><em>A fresh story.</em></h1><p>Build your cast. Find your angle. Make your next ad.</p></div><button type="button" className="cs-primary" disabled={!canEdit} onClick={() => openCharacter("new")}><span>＋</span> Create a character</button></header>
    <nav className="cs-tabs" aria-label="Character studio sections">{([['studio', 'Create an ad'], ['characters', 'My characters'], ['templates', 'Ad templates']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}{id === "characters" && <span>{data.characters.length}</span>}</button>)}<span className="cs-tabs-note">Your characters, across every campaign</span></nav>
    {!planEnabled && <div className="cs-banner">Character studio is not enabled for your plan. <Link href="/settings/billing">View plans →</Link></div>}
    {notice && <div className="cs-notice" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}

    {view === "studio" && <div className="cs-workspace"><div className="cs-controls">
      <section className="cs-section"><div className="cs-section-heading"><span>01</span><h2>Your character</h2><button type="button" className="cs-text-button" onClick={() => setView("characters")}>Manage cast ↗</button></div>
        {character ? <><div className="cs-character-selected"><div className="cs-avatar">{look?.url ? <img src={look.url} alt={character.name} /> : <span>{character.name.slice(0, 1)}</span>}</div><div className="cs-character-info"><label className="cs-sr" htmlFor="cs-character">Choose a character</label><select id="cs-character" value={character.id} onChange={e => { setCharacterId(e.target.value); setLookId(""); }}>{data.characters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><p>{character.personality}</p><span className="cs-badge">{character.status === "generating" || character.status === "queued" ? "Generating a look…" : "Saved brand character"}</span></div></div>
          {character.looks.length > 0 && <div className="cs-looks">{character.looks.map(l => <button type="button" key={l.id} aria-pressed={look?.id === l.id} onClick={() => setLookId(l.id)}><img src={l.url} alt="" />{l.name}</button>)}<button type="button" disabled={!canEdit || ["queued", "generating"].includes(character.status)} onClick={() => openCharacter("look")}>＋ New look</button></div>}
          {character.error && <p className="cs-error" role="alert">{character.error} <button type="button" className="cs-text-button" onClick={() => openCharacter("look")} disabled={!canEdit}>Try a new look</button></p>}
          <div className="cs-voice-row"><span>♫ {voice?.label ?? "Saved voice"}</span><button type="button" className="cs-text-button" disabled={!canEdit} onClick={() => openCharacter("profile")}>Edit profile</button></div>{voice?.previewUrl && <AudioPreview src={voice.previewUrl} label={`Preview ${voice.label}`} compact />}
        </> : <button type="button" className="cs-empty-character" onClick={() => openCharacter("new")} disabled={!canEdit}><span className="cs-empty-face">＋</span><span><strong>Meet your brand's new face</strong><small>Create a fictional character with a voice and personality.</small></span><span>↗</span></button>}
      </section>
      <section className="cs-section"><div className="cs-section-heading"><span>02</span><h2>What are we promoting?</h2><Link className="cs-text-button" href="/library">Product library ↗</Link></div><label className="cs-sr" htmlFor="cs-product">Product or service</label><select className="cs-input" id="cs-product" value={productId} onChange={e => pickProduct(e.target.value)}>{data.products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}<option value="">A service or another offer</option></select>{!product && <label className="cs-field">Service or offer name<input className="cs-input" value={serviceName} maxLength={120} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Your design subscription" /></label>}</section>
      <section className="cs-section"><div className="cs-section-heading"><span>03</span><h2>Choose the story</h2><button type="button" className="cs-text-button" onClick={() => setView("templates")}>All six formats ↗</button></div><div className="cs-format-list">{CHARACTER_TEMPLATES.slice(0, 3).map(t => <button key={t.id} type="button" aria-pressed={template === t.id} onClick={() => pickTemplate(t.id)}><span className="cs-format-symbol">{t.icon}</span><span><strong>{t.name}</strong><small>{t.description}</small></span><span className="cs-radio" /></button>)}{!CHARACTER_TEMPLATES.slice(0, 3).some(t => t.id === template) && <div className="cs-badge">Selected: {CHARACTER_TEMPLATES.find(t => t.id === template)?.name}</div>}</div></section>
      <section className="cs-section"><div className="cs-section-heading"><span>04</span><h2>Make the story yours</h2><span className={words > 75 ? "cs-error" : "cs-word-count"}>{words}/75 words</span></div><label className="cs-field">Opening<textarea className="cs-input" value={hook} maxLength={250} onChange={e => { setHook(e.target.value); setScene(0); }} rows={2} /></label><button type="button" className="cs-text-button cs-hooks-trigger" onClick={() => setShowHooks(!showHooks)}>{showHooks ? "Hide openings ↑" : "✦ Explore three openings"}</button>{showHooks && <div className="cs-hook-options">{hookVariations(name, template).map((h, i) => <button type="button" key={h} aria-pressed={hook === h} onClick={() => { setHook(h); setScene(0); }}><span>0{i + 1}</span>{h}</button>)}</div>}<label className="cs-field">Product message<textarea className="cs-input" value={body} maxLength={1500} onChange={e => setBody(e.target.value)} rows={3} placeholder="What should people know? Add the benefits and details you can support." /></label><label className="cs-field">Call to action<input className="cs-input" value={cta} maxLength={100} onChange={e => setCta(e.target.value)} /></label></section>
      <details className="cs-generation-settings"><summary>Generation settings <span>{selectedSceneModel?.label} · {data.videoModels.find(m => m.id === videoModel)?.label}</span></summary><label className="cs-field">Scene image model<button className="cs-model-trigger" type="button" onClick={() => openModels("scene")}><span>{selectedSceneModel?.label}</span><span>Choose model ↗</span></button></label><label className="cs-field">Product video model<select className="cs-input" value={videoModel} onChange={e => setVideoModel(e.target.value)}>{data.videoModels.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label><p>Character animation: HeyGen · Voice: ElevenLabs. Your image model creates the product scene stills.</p></details>
    </div><aside className="cs-preview-column"><div className="cs-preview-heading"><h2>Your ad, scene by scene</h2><label className="cs-sr" htmlFor="cs-ratio">Video aspect ratio</label><select id="cs-ratio" value={ratio} onChange={e => setRatio(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></div><div className={`cs-preview ${ratio === "1:1" ? "cs-square" : ratio === "16:9" ? "cs-landscape" : ""}`}>
      {previewUrl ? <img src={previewUrl} alt={scene === 0 ? `${character?.name}, ${look?.name}` : name} /> : scene === 0 ? <div className="cs-inspiration-photo" role="img" aria-label="Illustrative portrait, not a saved character" /> : <div className="cs-product-placeholder"><span>{name.slice(0, 1).toUpperCase()}</span><p>{name}</p></div>}
      <span className="cs-preview-label">{scene === 0 ? character?.portraitUrl ? "AI CHARACTER" : "STYLE INSPIRATION" : "PRODUCT STORYBOARD"}</span><span className="cs-preview-duration">~{seconds}s</span><div className="cs-preview-caption">{previewCaption}</div><div className="cs-preview-footer"><span>ADCRAFT / {brandName}</span><span>0{scene + 1} / 04</span></div></div><p className="cs-preview-disclaimer">Still storyboard · Your video is created when you generate.</p>
      <div className="cs-scene-strip" aria-label="Storyboard scenes">{["Opening", "Product", "Message", "Action"].map((s, i) => <button type="button" key={s} aria-pressed={scene === i} onClick={() => setScene(i)}><span>0{i + 1}</span><strong>{s}</strong></button>)}</div>
      <div className="cs-generate-panel"><div><span>Ready for your next campaign</span><strong>{videoCredits} <small>credits / ad</small></strong></div><button type="button" className="cs-primary" disabled={pending || !canGenerate} onClick={createAd}>{pending ? <><Spark size={16} animate="spin" />Starting your ad…</> : <>Generate character ad <span>↗</span></>}</button><p>{!data.videoConnected ? `Connect ${data.missingVideoProviders.join(", ")} to generate video.` : !look ? "Create your first character to get started." : words > 75 ? "Shorten the script to 75 words or fewer." : balance < videoCredits ? "Not enough credits. Top up in Settings." : !selectedSceneModel?.connected ? "Choose a connected scene image model." : `${balance} credits available · Generated videos open in your editor.`}</p>{error && <p className="cs-error" role="alert">{error}</p>}</div>
      <div className="cs-consistency"><span>◎</span><p><strong>A character you can come back to.</strong>Keep the same face and voice. Give each campaign a different story.</p></div>
    </aside></div>}

    {view === "characters" && <section><div className="cs-view-heading"><div><h2>Your recurring cast</h2><p>Private to {brandName}. Reuse a character or create a new look.</p></div><span className="cs-badge">{data.characters.length} characters</span></div><div className="cs-character-grid">{data.characters.map(c => <article className="cs-character-card" key={c.id}><div className="cs-cast-photo">{c.portraitUrl ? <img src={c.portraitUrl} alt={c.name} /> : <div className="cs-cast-pending"><Spark size={32} animate={c.status === "failed" ? undefined : "spin"} /><span>{c.status === "failed" ? "Generation failed" : "Creating your character…"}</span></div>}<span className="cs-preview-label">{c.looks.length} {c.looks.length === 1 ? "LOOK" : "LOOKS"}</span></div><div className="cs-cast-info"><h3>{c.name}</h3><p>{c.personality}</p>{c.error && <p className="cs-error">{c.error}</p>}<button type="button" className="cs-secondary" onClick={() => { setCharacterId(c.id); setLookId(""); setView("studio"); }}>{c.portraitUrl ? "Use character ↗" : "View character ↗"}</button></div></article>)}<button type="button" className="cs-new-character-card" disabled={!canEdit} onClick={() => openCharacter("new")}><span>＋</span><strong>A new face for your brand</strong><small>Design a fictional character from a description.</small></button></div></section>}

    {view === "templates" && <section><div className="cs-view-heading"><div><h2>Start with a story that fits.</h2><p>Six editable ad structures. Your character, product and voice.</p></div></div><div className="cs-template-grid">{CHARACTER_TEMPLATES.map((t, i) => <button type="button" key={t.id} className="cs-template-card" onClick={() => { pickTemplate(t.id); setView("studio"); }}><div className={`cs-template-art cs-art-${i % 3}`}><span>{t.icon}</span><small>FORMAT 0{i + 1}</small></div><div><h3>{t.name}</h3><p>{t.description}</p><span className="cs-text-button">Use this format ↗</span></div></button>)}</div></section>}

    <dialog ref={characterDialog} className="cs-dialog" aria-labelledby="cs-dialog-title" onCancel={e => { if (modalPending) e.preventDefault(); }} onClick={e => { if (e.target === e.currentTarget && !modalPending) characterDialog.current?.close(); }}><div className="cs-dialog-heading"><div><span className="cs-eyebrow">Your brand's recurring cast</span><h2 id="cs-dialog-title">{dialogMode === "new" ? "Create a character" : dialogMode === "look" ? `A new look for ${character?.name}` : "Character profile"}</h2></div><button className="cs-close" type="button" aria-label="Close character dialog" disabled={modalPending} onClick={() => characterDialog.current?.close()}>×</button></div>
      <form ref={characterForm} key={`${dialogMode}-${character?.id ?? "new"}`} onSubmit={submitCharacter} className="cs-character-form">
        {dialogMode !== "look" && <><div className="cs-form-pair"><label className="cs-field">Character name<input className="cs-input" name="name" required maxLength={60} placeholder="e.g. Maya" defaultValue={dialogMode === "profile" ? character?.name : ""} /></label><label className="cs-field">Personality<input className="cs-input" name="personality" maxLength={300} defaultValue={dialogMode === "profile" ? character?.personality : "Warm and conversational"} /></label></div>{dialogMode === "new" && <label className="cs-field">Describe your fictional adult character<textarea className="cs-input" name="description" minLength={15} maxLength={1500} required rows={3} placeholder="A friendly presenter in their thirties, curly dark hair, relaxed linen clothing, natural skin texture…" /></label>}<label className="cs-field">Recurring voice<select className="cs-input" value={voiceId} onChange={e => setVoiceId(e.target.value)}>{data.voices.map(v => <option value={v.id} key={v.id}>{v.label}</option>)}</select></label>{modalVoice?.previewUrl && <AudioPreview src={modalVoice.previewUrl} label="Preview character voice" compact />}</>}
        {dialogMode !== "profile" && <><div className="cs-form-pair"><label className="cs-field">Look name<input className="cs-input" name="lookName" required maxLength={60} defaultValue={dialogMode === "new" ? "Everyday" : ""} placeholder="e.g. Home office" /></label><label className="cs-field">Portrait model<button type="button" className="cs-model-trigger" onClick={() => openModels("portrait")}><span>{selectedPortraitModel?.label}</span><span>↗</span></button></label></div><label className="cs-field">Outfit and setting<textarea className="cs-input" name="lookPrompt" maxLength={1200} rows={2} defaultValue={dialogMode === "new" ? "Casual neutral clothing, a sunlit home, soft window light." : ""} placeholder="Describe a new outfit and setting. The original portrait stays the identity reference." /></label><p className="cs-modal-note">{dialogMode === "look" ? "The original portrait guides the new look. Review the result for face consistency before using it." : "Create a fictional adult presenter. The approved portrait becomes the reference for future looks."}</p></>}
        {modalError && <p className="cs-error" role="alert">{modalError}</p>}
        <div className="cs-dialog-footer"><span>{dialogMode === "profile" ? "Applies to future ads" : `${selectedPortraitModel?.creditsPerUnit ?? 0} credits · ${balance} available`}</span><button type="submit" className="cs-primary" disabled={modalPending || !canEdit || (dialogMode !== "profile" && (!selectedPortraitModel?.connected || !selectedPortraitModel.enabled || balance < selectedPortraitModel.creditsPerUnit))}>{modalPending ? "Saving…" : dialogMode === "profile" ? "Save profile" : "Generate portrait ↗"}</button></div>{dialogMode !== "profile" && !selectedPortraitModel?.connected && <p className="cs-error">{selectedPortraitModel?.provider === "fal" ? "fal.ai" : "OpenAI"} is not connected. Choose a connected model or ask your administrator to connect this provider.</p>}
      </form>
    </dialog>

    <dialog ref={modelDialog} className="cs-dialog cs-model-dialog" aria-labelledby="cs-model-title" onClick={e => { if (e.target === e.currentTarget) modelDialog.current?.close(); }}><div className="cs-dialog-heading"><div><span className="cs-eyebrow">Image generation</span><h2 id="cs-model-title">Find the right model for your idea.</h2><p>Choose how to create {modelTarget === "portrait" ? "your character's portrait" : "your product scene stills"}.</p></div><button type="button" className="cs-close" aria-label="Close model picker" onClick={() => modelDialog.current?.close()}>×</button></div><div className="cs-model-grid">{data.models.map((m, i) => <button type="button" key={m.id} className={`cs-model-card cs-model-art-${i % 4}`} aria-pressed={(modelTarget === "portrait" ? portraitModel : sceneModel) === m.id} disabled={!m.enabled} onClick={() => { if (modelTarget === "portrait") setPortraitModel(m.id); else setSceneModel(m.id); modelDialog.current?.close(); }}><div className="cs-model-visual"><span className="cs-model-maker">{(m.maker ?? inferMaker(m.id, m.provider)).toUpperCase()}</span><span className="cs-model-letter" aria-hidden="true"><MakerLogo maker={m.maker ?? inferMaker(m.id, m.provider)} size={72} /></span><span className="cs-model-check">{(modelTarget === "portrait" ? portraitModel : sceneModel) === m.id ? "✓" : "↗"}</span></div><div className="cs-model-info"><h3>{m.label}</h3><p>{m.notes}</p><div><span>{m.creditsPerUnit} credits / image</span><span className={m.connected && m.enabled ? "cs-connected" : ""}>{!m.enabled ? "Disabled" : m.connected ? "Connected" : "Not connected"}</span></div></div></button>)}</div><p className="cs-modal-note">Adcraft credit prices for one image. Provider access and availability depend on your connected account.</p></dialog>
  </div>;
}
