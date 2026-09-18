"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CharacterStudioData } from "@/server/character-studio";
import { CHARACTER_TEMPLATES, estimatedStudioSeconds, hookVariations, studioScript, type CharacterTemplateId } from "@/lib/character-studio";
import { applyLookPackAction, auditionVoiceAction, createCharacterAdAction, generateCharacterAction, loadPresenterLooks, saveCharacterAction, searchVoicesAction, setCharacterVoiceAction } from "./actions";
import { VoiceTools } from "./voice-tools";
import { Spark } from "@/components/spark";
import { MakerLogo, inferMaker } from "@/components/maker-logo";
import { PlayButton, VoiceField, VoicePicker, type CatalogVoice } from "@/components/voice-picker";
import { PresenterLibrary, type PresenterChoice } from "./presenter-library";

type Props = { data: CharacterStudioData; brandName: string; balance: number; videoCredits: number; canEdit: boolean; planEnabled: boolean };
type View = "studio" | "characters" | "presenters" | "voices" | "templates";
const TABS: Array<[View, string]> = [["studio", "Create an ad"], ["characters", "My characters"], ["templates", "Ad templates"]];
const isView = (v: string | null): v is View => v === "studio" || v === "characters" || v === "templates" || v === "presenters" || v === "voices";

export function CharacterStudio({ data, brandName, balance, videoCredits, canEdit, planEnabled }: Props) {
  const router = useRouter();
  // The section lives in the URL (/characters?view=voices) so the sidebar can link to the
  // libraries; Next syncs replaceState into useSearchParams without a server round trip.
  const params = useSearchParams();
  const paramView = params.get("view");
  const view: View = isView(paramView) ? paramView : "studio";
  function setView(v: View) { window.history.replaceState(null, "", v === "studio" ? window.location.pathname : `${window.location.pathname}?view=${v}`); window.scrollTo({ top: 0 }); }
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
  // New looks: our image models from a description, or HeyGen look packs / templates / prompt.
  const [lookSource, setLookSource] = useState<"describe" | "heygen">("describe");
  const [packId, setPackId] = useState<string>(data.lookPacks[0]?.id ?? "");
  const [packGender, setPackGender] = useState<"female" | "male">("female");
  const [packRatio, setPackRatio] = useState<"16:9" | "9:16">("9:16");
  const [packPrompt, setPackPrompt] = useState("");
  const [packLookName, setPackLookName] = useState("");
  const [dialogVoice, setDialogVoice] = useState<CatalogVoice | null>(data.defaultVoice);
  // Presenter source: a saved character (photo avatar) or a HeyGen library avatar.
  const [stockAvatar, setStockAvatar] = useState<PresenterChoice | null>(null);
  const [stockVoice, setStockVoice] = useState<CatalogVoice | null>(data.defaultVoice);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  // Browsing the libraries as pages: what's highlighted, before it's used anywhere.
  const [browsePresenter, setBrowsePresenter] = useState<PresenterChoice | null>(null);
  const [browseVoice, setBrowseVoice] = useState<CatalogVoice | null>(null);
  const [browsePlaying, setBrowsePlaying] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [modalPending, startModal] = useTransition();
  const characterDialog = useRef<HTMLDialogElement>(null);
  const modelDialog = useRef<HTMLDialogElement>(null);
  const characterForm = useRef<HTMLFormElement>(null);
  const busy = data.characters.some(c => c.status === "queued" || c.status === "generating") || data.presenterLibraryLoading;
  useEffect(() => { if (!busy) return; const interval = setInterval(() => router.refresh(), data.presenterLibraryLoading ? 10000 : 4000); return () => clearInterval(interval); }, [busy, data.presenterLibraryLoading, router]);
  const selectedPortraitModel = data.models.find(m => m.id === portraitModel);
  const selectedSceneModel = data.models.find(m => m.id === sceneModel);
  const script = studioScript(hook, body, cta);
  const words = script.split(/\s+/).filter(Boolean).length;
  const seconds = estimatedStudioSeconds(script);
  const voice = character?.voice ?? null;
  const previewUrl = scene === 0 ? (stockAvatar ? stockAvatar.look.previewUrl ?? undefined : look?.url) : product?.imageUrl;
  const previewCaption = [hook, product?.name || serviceName || "Your product", body || "Your product message", cta][scene];
  const canGenerate = canEdit && data.videoConnected && (!!stockAvatar || !!look) && !!body.trim() && !!hook.trim() && !!cta.trim() && !!(product || serviceName.trim()) && words <= 75 && balance >= videoCredits && selectedSceneModel?.connected && selectedSceneModel.enabled && !!videoModel;

  function pickTemplate(id: CharacterTemplateId) { setTemplate(id); setHook(hookVariations(name, id)[0]!); setScene(0); }
  function pickProduct(id: string) { setProductId(id); const item = data.products.find(p => p.id === id); setBody(item?.description ?? ""); setHook(hookVariations(item?.name || serviceName || "your service", template)[0]!); }
  function openCharacter(mode: "new" | "look" | "profile", preset?: CatalogVoice | null) {
    setDialogMode(mode); setModalError(""); setDialogVoice(preset ?? (mode === "new" ? data.defaultVoice : character?.voice ?? data.defaultVoice));
    if (mode === "look") { setLookSource(character?.onHeyGen ? "heygen" : "describe"); setPackGender(character?.voice?.gender === "male" ? "male" : "female"); setPackRatio(ratio === "16:9" ? "16:9" : "9:16"); setPackPrompt(""); setPackLookName(""); }
    characterDialog.current?.showModal();
  }
  function openModels(target: "portrait" | "scene") { setModelTarget(target); modelDialog.current?.showModal(); }
  function submitCharacter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialogMode === "look" && lookSource === "heygen") {
      const form = new FormData();
      const pack = data.lookPacks.find(p => p.id === packId);
      Object.entries({ characterId: character?.id ?? "", source: packId === "prompt" ? "prompt" : "pack", packId, gender: packGender, aspectRatio: packRatio, prompt: packPrompt, lookName: packLookName || pack?.name || "New look" }).forEach(([k, v]) => form.set(k, v));
      setModalError("");
      startModal(async () => {
        try {
          const result = await applyLookPackAction(form);
          if (result.error) { setModalError(result.error); return; }
          setNotice(packId === "prompt" ? "HeyGen is generating the look. It appears here when it is ready." : `HeyGen is generating ${pack?.looks ?? 5} looks. They appear here as they finish.`);
          characterDialog.current?.close(); router.refresh();
        } catch { setModalError("Could not reach the server. Please try again."); }
      });
      return;
    }
    const form = new FormData(e.currentTarget); form.set("imageModel", portraitModel); form.set("voiceId", dialogVoice?.id ?? "");
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
  /** From the voice library: put the voice where the studio is currently pointing. */
  function useBrowsedVoice(v: CatalogVoice) {
    if (stockAvatar) { setStockVoice(v); setNotice(`${v.name} will speak for ${stockAvatar.person.name}.`); setView("studio"); return; }
    if (character) {
      start(async () => {
        const result = await setCharacterVoiceAction(character.id, v.id);
        if (result.error) { setError(result.error); return; }
        setNotice(`${v.name} is now ${character.name}'s recurring voice.`); router.refresh(); setView("studio");
      });
      return;
    }
    setStockVoice(v); setDialogVoice(v); setNotice(`${v.name} is ready — pick a presenter from the library or create a character.`); setView("presenters");
  }
  function createAd() {
    setError("");
    const form = new FormData();
    Object.entries({ characterId: stockAvatar ? "" : character?.id ?? "", lookId: stockAvatar ? "" : look?.id ?? "", stockAvatarId: stockAvatar?.look.id ?? "", stockPersonName: stockAvatar?.person.name ?? "", voiceId: stockAvatar ? stockVoice?.id ?? "" : "", productId, serviceName, templateId: template, hook, body, cta, ratio, videoModel, imageModel: sceneModel }).forEach(([key, value]) => form.set(key, value));
    start(async () => {
      try { const result = await createCharacterAdAction(form); if (result.error) setError(result.error); else if (result.creativeId) router.push(`/videos/${result.creativeId}`); }
      catch { setError("Could not start the ad. Please try again."); }
    });
  }

  const library = view === "presenters" || view === "voices";
  return <div className="character-studio">
    {library && <div className="cs-crumb"><button type="button" className="cs-text-button" onClick={() => setView("studio")}>← Character studio</button><span>{brandName}</span></div>}
    {!library && <header className="cs-header"><div><span className="cs-eyebrow">{brandName} / Character studio</span><h1>A familiar face.<br /><em>A fresh story.</em></h1><p>Build your cast. Find your angle. Make your next ad.</p></div><button type="button" className="cs-primary" disabled={!canEdit} onClick={() => openCharacter("new")}><span>＋</span> Create a character</button></header>}
    {!library && <nav className="cs-tabs" aria-label="Character studio sections">{TABS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}{id === "characters" && <span>{data.characters.length}</span>}</button>)}<span className="cs-tabs-note">Your characters, across every campaign</span></nav>}
    {!planEnabled && <div className="cs-banner">Character studio is not enabled for your plan. <Link href="/settings/billing">View plans →</Link></div>}
    {notice && <div className="cs-notice" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}

    {view === "studio" && <div className="cs-workspace"><div className="cs-controls">
      <section className="cs-section"><div className="cs-section-heading"><span>01</span><h2>Your character</h2><button type="button" className="cs-text-button" onClick={() => setView("characters")}>Manage cast ↗</button></div>
        <div className="cs-source" role="tablist" aria-label="Presenter source">
          <button type="button" role="tab" aria-selected={!stockAvatar} onClick={() => setStockAvatar(null)}>My character</button>
          <button type="button" role="tab" aria-selected={!!stockAvatar} onClick={() => (stockAvatar ? undefined : libraryDialog.current?.showModal())}>Presenter library <span>{data.presenterLibraryLoading ? "indexing…" : data.presenterGroups.length ? `${data.presenterGroups.length.toLocaleString()} people` : "HeyGen"}</span></button>
        </div>
        {stockAvatar ? <>
          <div className="cs-character-selected"><div className="cs-avatar">{stockAvatar.look.previewUrl ? <img src={stockAvatar.look.previewUrl} alt={stockAvatar.person.name} /> : <span>{stockAvatar.person.name.slice(0, 1)}</span>}</div><div className="cs-character-info"><h3>{stockAvatar.person.name} <span className="cs-look-name">· {stockAvatar.look.name}</span></h3><p>{stockAvatar.look.type === "studio_avatar" ? "Filmed studio presenter — gestures and body language are part of the footage." : stockAvatar.look.type === "digital_twin" ? "Digital twin — video-trained, reference-driven motion." : `AI photo avatar${stockAvatar.look.engines.includes("avatar_v") ? " · Avatar V motion with gesture direction" : " · Avatar IV motion"}.`}</p><span className="cs-badge">Licensed library presenter</span></div><button type="button" className="cs-text-button" onClick={() => libraryDialog.current?.showModal()}>Change ↗</button></div>
          <VoiceField voice={stockVoice} search={searchVoicesAction} audition={auditionVoiceAction} onChange={setStockVoice} disabled={!canEdit} />
        </> : character ? <><div className="cs-character-selected"><div className="cs-avatar">{look?.url ? <img src={look.url} alt={character.name} /> : <span>{character.name.slice(0, 1)}</span>}</div><div className="cs-character-info"><label className="cs-sr" htmlFor="cs-character">Choose a character</label><select id="cs-character" value={character.id} onChange={e => { setCharacterId(e.target.value); setLookId(""); }}>{data.characters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><p>{character.personality}</p><span className="cs-badge">{character.status === "generating" || character.status === "queued" ? "Generating a look…" : "Saved brand character"}</span></div></div>
          {character.looks.length > 0 && <div className="cs-looks">{character.looks.map(l => <button type="button" key={l.id} aria-pressed={look?.id === l.id} onClick={() => setLookId(l.id)} title={l.heygen ? "Generated on HeyGen — renders with Avatar V motion" : undefined}><img src={l.url} alt="" />{l.name}{l.heygen && <span className="cs-look-hg" aria-label="HeyGen look">HG</span>}</button>)}<button type="button" disabled={!canEdit || ["queued", "generating"].includes(character.status)} onClick={() => openCharacter("look")}>＋ New look</button></div>}
          {character.error && <p className="cs-error" role="alert">{character.error} <button type="button" className="cs-text-button" onClick={() => openCharacter("look")} disabled={!canEdit}>Try a new look</button></p>}
          <div className="cs-voice-row"><span>{({ low: "Calm", medium: "Natural", high: "Energetic" } as const)[character.motion?.expressiveness ?? "high"]} on camera{character.motion?.prompt ? ` · ${character.motion.prompt}` : ""}</span><button type="button" className="cs-text-button" disabled={!canEdit} onClick={() => openCharacter("profile")}>Edit profile</button></div>
          {voice ? <VoiceField voice={voice} search={searchVoicesAction} audition={auditionVoiceAction} onChange={() => openCharacter("profile")} disabled={!canEdit} label="Recurring voice" /> : null}
        </> : <button type="button" className="cs-empty-character" onClick={() => openCharacter("new")} disabled={!canEdit}><span className="cs-empty-face">＋</span><span><strong>Meet your brand's new face</strong><small>Create a fictional character with a voice and personality — or pick a filmed presenter from the library above.</small></span><span>↗</span></button>}
      </section>
      <section className="cs-section"><div className="cs-section-heading"><span>02</span><h2>What are we promoting?</h2><Link className="cs-text-button" href="/library">Product library ↗</Link></div><label className="cs-sr" htmlFor="cs-product">Product or service</label><select className="cs-input" id="cs-product" value={productId} onChange={e => pickProduct(e.target.value)}>{data.products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}<option value="">A service or another offer</option></select>{!product && <label className="cs-field">Service or offer name<input className="cs-input" value={serviceName} maxLength={120} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Your design subscription" /></label>}</section>
      <section className="cs-section"><div className="cs-section-heading"><span>03</span><h2>Choose the story</h2><button type="button" className="cs-text-button" onClick={() => setView("templates")}>All six formats ↗</button></div><div className="cs-format-list">{CHARACTER_TEMPLATES.slice(0, 3).map(t => <button key={t.id} type="button" aria-pressed={template === t.id} onClick={() => pickTemplate(t.id)}><span className="cs-format-symbol">{t.icon}</span><span><strong>{t.name}</strong><small>{t.description}</small></span><span className="cs-radio" /></button>)}{!CHARACTER_TEMPLATES.slice(0, 3).some(t => t.id === template) && <div className="cs-badge">Selected: {CHARACTER_TEMPLATES.find(t => t.id === template)?.name}</div>}</div></section>
      <section className="cs-section"><div className="cs-section-heading"><span>04</span><h2>Make the story yours</h2><span className={words > 75 ? "cs-error" : "cs-word-count"}>{words}/75 words</span></div><label className="cs-field">Opening<textarea className="cs-input" value={hook} maxLength={250} onChange={e => { setHook(e.target.value); setScene(0); }} rows={2} /></label><button type="button" className="cs-text-button cs-hooks-trigger" onClick={() => setShowHooks(!showHooks)}>{showHooks ? "Hide openings ↑" : "✦ Explore three openings"}</button>{showHooks && <div className="cs-hook-options">{hookVariations(name, template).map((h, i) => <button type="button" key={h} aria-pressed={hook === h} onClick={() => { setHook(h); setScene(0); }}><span>0{i + 1}</span>{h}</button>)}</div>}<label className="cs-field">Product message<textarea className="cs-input" value={body} maxLength={1500} onChange={e => setBody(e.target.value)} rows={3} placeholder="What should people know? Add the benefits and details you can support." /></label><label className="cs-field">Call to action<input className="cs-input" value={cta} maxLength={100} onChange={e => setCta(e.target.value)} /></label></section>
      <details className="cs-generation-settings"><summary>Generation settings <span>{selectedSceneModel?.label} · {data.videoModels.find(m => m.id === videoModel)?.label}</span></summary><label className="cs-field">Scene image model<button className="cs-model-trigger" type="button" onClick={() => openModels("scene")}><span>{selectedSceneModel?.label}</span><span>Choose model ↗</span></button></label><label className="cs-field">Product video model<select className="cs-input" value={videoModel} onChange={e => setVideoModel(e.target.value)}>{data.videoModels.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label><p>Character animation: HeyGen · Voice: ElevenLabs. Your image model creates the product scene stills.</p></details>
    </div><aside className="cs-preview-column"><div className="cs-preview-heading"><h2>Your ad, scene by scene</h2><label className="cs-sr" htmlFor="cs-ratio">Video aspect ratio</label><select id="cs-ratio" value={ratio} onChange={e => setRatio(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></div><div className={`cs-preview ${ratio === "1:1" ? "cs-square" : ratio === "16:9" ? "cs-landscape" : ""}`}>
      {previewUrl ? <img src={previewUrl} alt={scene === 0 ? `${character?.name}, ${look?.name}` : name} /> : scene === 0 ? <div className="cs-inspiration-photo" role="img" aria-label="Illustrative portrait, not a saved character" /> : <div className="cs-product-placeholder"><span>{name.slice(0, 1).toUpperCase()}</span><p>{name}</p></div>}
      <span className="cs-preview-label">{scene === 0 ? stockAvatar ? "LIBRARY PRESENTER" : character?.portraitUrl ? "AI CHARACTER" : "STYLE INSPIRATION" : "PRODUCT STORYBOARD"}</span><span className="cs-preview-duration">~{seconds}s</span><div className="cs-preview-caption">{previewCaption}</div><div className="cs-preview-footer"><span>ADCRAFT / {brandName}</span><span>0{scene + 1} / 04</span></div></div><p className="cs-preview-disclaimer">Still storyboard · Your video is created when you generate.</p>
      <div className="cs-scene-strip" aria-label="Storyboard scenes">{["Opening", "Product", "Message", "Action"].map((s, i) => <button type="button" key={s} aria-pressed={scene === i} onClick={() => setScene(i)}><span>0{i + 1}</span><strong>{s}</strong></button>)}</div>
      <div className="cs-generate-panel"><div><span>Ready for your next campaign</span><strong>{videoCredits} <small>credits / ad</small></strong></div><button type="button" className="cs-primary" disabled={pending || !canGenerate} onClick={createAd}>{pending ? <><Spark size={16} animate="spin" />Starting your ad…</> : <>Generate character ad <span>↗</span></>}</button><p>{!data.videoConnected ? `Connect ${data.missingVideoProviders.join(", ")} to generate video.` : !look ? "Create your first character to get started." : words > 75 ? "Shorten the script to 75 words or fewer." : balance < videoCredits ? "Not enough credits. Top up in Settings." : !selectedSceneModel?.connected ? "Choose a connected scene image model." : `${balance} credits available · Generated videos open in your editor.`}</p>{error && <p className="cs-error" role="alert">{error}</p>}</div>
      <div className="cs-consistency"><span>◎</span><p><strong>A character you can come back to.</strong>Keep the same face and voice. Give each campaign a different story.</p></div>
    </aside></div>}

    {view === "characters" && <section><div className="cs-view-heading"><div><h2>Your recurring cast</h2><p>Private to {brandName}. Reuse a character or create a new look.</p></div><span className="cs-badge">{data.characters.length} characters</span></div><div className="cs-character-grid">{data.characters.map(c => <article className="cs-character-card" key={c.id}><div className="cs-cast-photo">{c.portraitUrl ? <img src={c.portraitUrl} alt={c.name} /> : <div className="cs-cast-pending"><Spark size={32} animate={c.status === "failed" ? undefined : "spin"} /><span>{c.status === "failed" ? "Generation failed" : "Creating your character…"}</span></div>}<span className="cs-preview-label">{c.looks.length} {c.looks.length === 1 ? "LOOK" : "LOOKS"}</span></div><div className="cs-cast-info"><h3>{c.name}</h3><p>{c.personality}</p>{c.error && <p className="cs-error">{c.error}</p>}<button type="button" className="cs-secondary" onClick={() => { setCharacterId(c.id); setLookId(""); setView("studio"); }}>{c.portraitUrl ? "Use character ↗" : "View character ↗"}</button></div></article>)}<button type="button" className="cs-new-character-card" disabled={!canEdit} onClick={() => openCharacter("new")}><span>＋</span><strong>A new face for your brand</strong><small>Design a fictional character from a description.</small></button></div></section>}

    {view === "presenters" && <section className="cs-library">
      {data.presenterLibraryLoading ? <div className="cs-library-indexing"><Spark size={28} animate="spin" /><div><strong>Indexing HeyGen's library</strong><p>About 1,400 people and 25,000 looks are being catalogued for the first time. This takes a couple of minutes and only happens once.</p></div></div>
        : data.presenterGroups.length === 0 ? <div className="cs-library-indexing"><div><strong>Connect HeyGen to browse presenters</strong><p>Add a HeyGen key to unlock filmed studio presenters, AI avatars and digital twins.</p></div></div>
        : <PresenterLibrary mode="page" groups={data.presenterGroups} loadLooks={loadPresenterLooks} selectedId={browsePresenter?.look.id ?? stockAvatar?.look.id} ratio={ratio} onSelect={c => setBrowsePresenter(c)} />}
      {browsePresenter && <div className="cs-pickbar" role="region" aria-label="Selected presenter">
        <div className="cs-pickbar-thumb">{browsePresenter.look.previewUrl ? <img src={browsePresenter.look.previewUrl} alt="" /> : <span>{browsePresenter.person.name.slice(0, 1)}</span>}</div>
        <div className="cs-pickbar-text"><strong>{browsePresenter.person.name.trim() || "Unnamed presenter"} <span>· {browsePresenter.look.name}</span></strong><small>{browsePresenter.look.type === "studio_avatar" ? "Filmed studio presenter — gestures are in the footage" : browsePresenter.look.type === "digital_twin" ? "Digital twin — video-trained motion" : browsePresenter.look.engines.includes("avatar_v") ? "AI avatar — Avatar V motion with gesture direction" : "AI avatar — Avatar IV motion"}{browsePresenter.look.orientation ? ` · ${browsePresenter.look.orientation}` : ""}</small></div>
        <button type="button" className="cs-secondary" onClick={() => setBrowsePresenter(null)}>Clear</button>
        <button type="button" className="cs-primary" disabled={!canEdit} onClick={() => { const c = browsePresenter; setStockAvatar(c); setScene(0); const g = c.look.gender ?? c.person.gender; if (g && stockVoice?.gender !== g) void searchVoicesAction({ gender: g, provider: "elevenlabs" }).then(r => r.items[0] ?? searchVoicesAction({ gender: g }).then(x => x.items[0])).then(v => v && setStockVoice(v)); setNotice(`${c.person.name} is your presenter. Write the story and generate.`); setView("studio"); }}>Create an ad with {browsePresenter.person.name.trim().split(" ")[0] || "this presenter"} <span>→</span></button>
      </div>}
    </section>}

    {view === "voices" && <section className="cs-library">
      {data.voiceStats.total === 0 ? <div className="cs-library-indexing"><div><strong>Connect ElevenLabs or HeyGen to browse voices</strong><p>Either key unlocks a catalogue of voices your presenters can speak with.</p></div></div>
        : <>
          <VoiceTools voices={data.ownVoices} canEdit={canEdit} onUse={v => { setBrowseVoice(v); setBrowsePlaying(false); }} />
          <VoicePicker mode="page" stats={data.voiceStats} search={searchVoicesAction} audition={auditionVoiceAction} selectedId={browseVoice?.id} onSelect={v => { setBrowseVoice(v); setBrowsePlaying(false); }} />
        </>}
      {browseVoice && <div className="cs-pickbar" role="region" aria-label="Selected voice">
        <div className="cs-pickbar-thumb cs-pickbar-audio"><PlayButton src={browseVoice.previewUrl} active={browsePlaying} onToggle={setBrowsePlaying} /></div>
        <div className="cs-pickbar-text"><strong>{browseVoice.name} <span>· {browseVoice.owned === "clone" ? "Your clone" : browseVoice.owned === "designed" ? "Designed for you" : browseVoice.provider === "heygen" ? "HeyGen" : "ElevenLabs"}</span></strong><small>{[browseVoice.style, browseVoice.gender === "female" ? "Woman" : browseVoice.gender === "male" ? "Man" : null, browseVoice.language, browseVoice.accent].filter(Boolean).join(" · ") || "Voice"}{browseVoice.emotion ? " · emotion tags" : ""}</small></div>
        <button type="button" className="cs-secondary" disabled={!canEdit} onClick={() => openCharacter("new", browseVoice)}>New character with this voice</button>
        <button type="button" className="cs-primary" disabled={!canEdit || pending} onClick={() => useBrowsedVoice(browseVoice)}>{stockAvatar ? `Use with ${stockAvatar.person.name.trim().split(" ")[0]}` : character ? `Make it ${character.name.split(" ")[0]}'s voice` : "Use in an ad"} <span>→</span></button>
      </div>}
    </section>}

    {view === "templates" && <section><div className="cs-view-heading"><div><h2>Start with a story that fits.</h2><p>Six editable ad structures. Your character, product and voice.</p></div></div><div className="cs-template-grid">{CHARACTER_TEMPLATES.map((t, i) => <button type="button" key={t.id} className="cs-template-card" onClick={() => { pickTemplate(t.id); setView("studio"); }}><div className={`cs-template-art cs-art-${i % 3}`}><span>{t.icon}</span><small>FORMAT 0{i + 1}</small></div><div><h3>{t.name}</h3><p>{t.description}</p><span className="cs-text-button">Use this format ↗</span></div></button>)}</div></section>}

    <dialog ref={characterDialog} className="cs-dialog" aria-labelledby="cs-dialog-title" onCancel={e => { if (modalPending) e.preventDefault(); }} onClick={e => { if (e.target === e.currentTarget && !modalPending) characterDialog.current?.close(); }}><div className="cs-dialog-heading"><div><span className="cs-eyebrow">Your brand's recurring cast</span><h2 id="cs-dialog-title">{dialogMode === "new" ? "Create a character" : dialogMode === "look" ? `A new look for ${character?.name}` : "Character profile"}</h2></div><button className="cs-close" type="button" aria-label="Close character dialog" disabled={modalPending} onClick={() => characterDialog.current?.close()}>×</button></div>
      <form ref={characterForm} key={`${dialogMode}-${character?.id ?? "new"}`} onSubmit={submitCharacter} className="cs-character-form">
        {dialogMode !== "look" && <><div className="cs-form-pair"><label className="cs-field">Character name<input className="cs-input" name="name" required maxLength={60} placeholder="e.g. Maya" defaultValue={dialogMode === "profile" ? character?.name : ""} /></label><label className="cs-field">Personality<input className="cs-input" name="personality" maxLength={300} defaultValue={dialogMode === "profile" ? character?.personality : "Warm and conversational"} /></label></div><div className="cs-form-pair"><label className="cs-field">On-camera energy<select className="cs-input" name="expressiveness" defaultValue={dialogMode === "profile" ? character?.motion?.expressiveness ?? "high" : "high"}><option value="high">Energetic</option><option value="medium">Natural</option><option value="low">Calm</option></select><span className="cs-field-hint">Energetic: expressive hands · Natural: relaxed gestures · Calm: mostly still</span></label><label className="cs-field"><span className="cs-field-row">Gesture notes <span className="cs-optional">optional</span></span><input className="cs-input" name="motionPrompt" maxLength={300} placeholder="e.g. holds the product up at the second sentence, leans in slightly" defaultValue={dialogMode === "profile" ? character?.motion?.prompt ?? "" : ""} /></label></div>{dialogMode === "new" && <label className="cs-field">Describe your fictional adult character<textarea className="cs-input" name="description" minLength={15} maxLength={1500} required rows={3} placeholder="A friendly presenter in their thirties, curly dark hair, relaxed linen clothing, natural skin texture…" /></label>}<div className="cs-field"><VoiceField voice={dialogVoice} search={searchVoicesAction} audition={auditionVoiceAction} onChange={setDialogVoice} label="Recurring voice" labelClassName="cs-field-label" /></div></>}
        {dialogMode === "look" && <div className="cs-source lp-source" role="tablist" aria-label="How to create the look">
          <button type="button" role="tab" aria-selected={lookSource === "describe"} onClick={() => setLookSource("describe")}>Describe it <span>your image model</span></button>
          <button type="button" role="tab" aria-selected={lookSource === "heygen"} onClick={() => setLookSource("heygen")}>HeyGen look packs <span>{data.lookPacks.length} packs</span></button>
        </div>}
        {dialogMode === "look" && lookSource === "heygen" && <div className="lp-root">
          <div className="lp-controls">
            <div className="pl-segment" role="group" aria-label="Wardrobe variant">{(["female", "male"] as const).map(g => <button type="button" key={g} aria-pressed={packGender === g} onClick={() => setPackGender(g)}>{g === "female" ? "Women's wardrobe" : "Men's wardrobe"}</button>)}</div>
            <div className="pl-segment" role="group" aria-label="Frame">{(["9:16", "16:9"] as const).map(r => <button type="button" key={r} aria-pressed={packRatio === r} onClick={() => setPackRatio(r)}>{r === "9:16" ? "Portrait 9:16" : "Landscape 16:9"}</button>)}</div>
          </div>
          <div className="lp-grid" role="listbox" aria-label="Look packs">
            {data.lookPacks.map(pk => <div key={pk.id} role="option" tabIndex={0} aria-selected={packId === pk.id} className="lp-card" onClick={() => setPackId(pk.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPackId(pk.id); } }}>
              <span className="lp-swatch" aria-hidden="true">{pk.palette.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              <span className="lp-card-text"><strong>{pk.name}</strong><small>{pk.description}</small></span>
              <span className="lp-card-meta"><span className={`lp-kind ${pk.kind}`}>{pk.kind === "style" ? "Style pack" : "Role pack"}</span><span>{pk.looks} {pk.looks === 1 ? "look" : "looks"}</span></span>
            </div>)}
            <div role="option" tabIndex={0} aria-selected={packId === "prompt"} className="lp-card lp-prompt" onClick={() => setPackId("prompt")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPackId("prompt"); } }}>
              <span className="lp-swatch lp-swatch-prompt" aria-hidden="true">Aa</span>
              <span className="lp-card-text"><strong>Your own words</strong><small>Describe an outfit and setting; HeyGen keeps the face.</small></span>
              <span className="lp-card-meta"><span className="lp-kind prompt">Prompt</span><span>1 look</span></span>
            </div>
          </div>
          {packId === "prompt" && <div className="cs-form-pair"><label className="cs-field">Look name<input className="cs-input" maxLength={60} value={packLookName} onChange={e => setPackLookName(e.target.value)} placeholder="e.g. Rooftop at dusk" /></label><label className="cs-field">Outfit and setting<input className="cs-input" maxLength={1000} value={packPrompt} onChange={e => setPackPrompt(e.target.value)} placeholder="Navy blazer, modern office with plants, warm natural light" /></label></div>}
          <p className="cs-modal-note">{character?.onHeyGen ? "This character is registered on HeyGen; new looks render with Avatar V motion and gesture direction." : "The portrait is registered with HeyGen once (about a minute), then the looks are generated against it. Looks render with Avatar V motion and gesture direction."}</p>
        </div>}
        {dialogMode !== "profile" && !(dialogMode === "look" && lookSource === "heygen") && <><div className="cs-form-pair"><label className="cs-field">Look name<input className="cs-input" name="lookName" required maxLength={60} defaultValue={dialogMode === "new" ? "Everyday" : ""} placeholder="e.g. Home office" /></label><label className="cs-field">Portrait model<button type="button" className="cs-model-trigger" onClick={() => openModels("portrait")}><span>{selectedPortraitModel?.label}</span><span>↗</span></button></label></div><label className="cs-field">Outfit and setting<textarea className="cs-input" name="lookPrompt" maxLength={1200} rows={2} defaultValue={dialogMode === "new" ? "Casual neutral clothing, a sunlit home, soft window light." : ""} placeholder="Describe a new outfit and setting. The original portrait stays the identity reference." /></label><p className="cs-modal-note">{dialogMode === "look" ? "The original portrait guides the new look. Review the result for face consistency before using it." : "Create a fictional adult presenter. The approved portrait becomes the reference for future looks."}</p></>}
        {modalError && <p className="cs-error" role="alert">{modalError}</p>}
        {dialogMode === "look" && lookSource === "heygen" ? (() => { const pk = data.lookPacks.find(p => p.id === packId); const n = packId === "prompt" ? 1 : pk?.looks ?? 5; const cost = n * data.heygenLookCredits; return <div className="cs-dialog-footer"><span>{cost} credits · {balance} available{!data.heygenConnected ? " · connect HeyGen" : ""}</span><button type="submit" className="cs-primary" disabled={modalPending || !canEdit || !data.heygenConnected || balance < cost || (packId === "prompt" && packPrompt.trim().length < 10)}>{modalPending ? "Starting…" : n === 1 ? "Generate look ↗" : `Generate ${n} looks ↗`}</button></div>; })() :
        <div className="cs-dialog-footer"><span>{dialogMode === "profile" ? "Applies to future ads" : `${selectedPortraitModel?.creditsPerUnit ?? 0} credits · ${balance} available`}</span><button type="submit" className="cs-primary" disabled={modalPending || !canEdit || (dialogMode !== "profile" && (!selectedPortraitModel?.connected || !selectedPortraitModel.enabled || balance < selectedPortraitModel.creditsPerUnit))}>{modalPending ? "Saving…" : dialogMode === "profile" ? "Save profile" : "Generate portrait ↗"}</button></div>}{dialogMode !== "profile" && !(dialogMode === "look" && lookSource === "heygen") && !selectedPortraitModel?.connected && <p className="cs-error">{selectedPortraitModel?.provider === "fal" ? "fal.ai" : "OpenAI"} is not connected. Choose a connected model or ask your administrator to connect this provider.</p>}
      </form>
    </dialog>

    <dialog ref={libraryDialog} className="cs-dialog cs-library-dialog" aria-labelledby="pl-title" onClick={e => { if (e.target === e.currentTarget) libraryDialog.current?.close(); }}>
      <PresenterLibrary groups={data.presenterGroups} loadLooks={loadPresenterLooks} selectedId={stockAvatar?.look.id} ratio={ratio} onSelect={c => { setStockAvatar(c); setScene(0); const g = c.look.gender ?? c.person.gender; if (g && stockVoice?.gender !== g) void searchVoicesAction({ gender: g, provider: "elevenlabs" }).then(r => r.items[0] ?? searchVoicesAction({ gender: g }).then(x => x.items[0])).then(v => v && setStockVoice(v)); libraryDialog.current?.close(); }} onClose={() => libraryDialog.current?.close()} />
    </dialog>
    <dialog ref={modelDialog} className="cs-dialog cs-model-dialog" aria-labelledby="cs-model-title" onClick={e => { if (e.target === e.currentTarget) modelDialog.current?.close(); }}><div className="cs-dialog-heading"><div><span className="cs-eyebrow">Image generation</span><h2 id="cs-model-title">Find the right model for your idea.</h2><p>Choose how to create {modelTarget === "portrait" ? "your character's portrait" : "your product scene stills"}.</p></div><button type="button" className="cs-close" aria-label="Close model picker" onClick={() => modelDialog.current?.close()}>×</button></div><div className="cs-model-grid">{data.models.map((m, i) => <button type="button" key={m.id} className={`cs-model-card cs-model-art-${i % 4}`} aria-pressed={(modelTarget === "portrait" ? portraitModel : sceneModel) === m.id} disabled={!m.enabled} onClick={() => { if (modelTarget === "portrait") setPortraitModel(m.id); else setSceneModel(m.id); modelDialog.current?.close(); }}><div className="cs-model-visual"><span className="cs-model-maker">{(m.maker ?? inferMaker(m.id, m.provider)).toUpperCase()}</span><span className="cs-model-letter" aria-hidden="true"><MakerLogo maker={m.maker ?? inferMaker(m.id, m.provider)} size={72} /></span><span className="cs-model-check">{(modelTarget === "portrait" ? portraitModel : sceneModel) === m.id ? "✓" : "↗"}</span></div><div className="cs-model-info"><h3>{m.label}</h3><p>{m.notes}</p><div><span>{m.creditsPerUnit} credits / image</span><span className={m.connected && m.enabled ? "cs-connected" : ""}>{!m.enabled ? "Disabled" : m.connected ? "Connected" : "Not connected"}</span></div></div></button>)}</div><p className="cs-modal-note">Adcraft credit prices for one image. Provider access and availability depend on your connected account.</p></dialog>
  </div>;
}
