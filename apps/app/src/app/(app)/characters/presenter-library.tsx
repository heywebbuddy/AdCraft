"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type LibraryAvatar = {
  id: string;
  label: string;
  person: string;
  look: string;
  gender: "male" | "female" | null;
  previewUrl: string | null;
  previewVideoUrl: string | null;
};

/**
 * HeyGen's public presenter library: ~160 filmed people, each with several looks
 * (pose / setting). Search, filter by gender, pick a person, then a look. Hovering a
 * card plays the short preview clip so the motion is visible before choosing.
 */
export function PresenterLibrary({ avatars, selectedId, onSelect, onClose }: { avatars: LibraryAvatar[]; selectedId?: string; onSelect: (a: LibraryAvatar) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [person, setPerson] = useState<string | null>(() => avatars.find((a) => a.id === selectedId)?.person ?? null);

  const people = useMemo(() => {
    const map = new Map<string, LibraryAvatar[]>();
    for (const a of avatars) {
      if (gender !== "all" && a.gender !== gender) continue;
      if (query && !`${a.person} ${a.look} ${a.label}`.toLowerCase().includes(query.toLowerCase())) continue;
      map.set(a.person, [...(map.get(a.person) ?? []), a]);
    }
    return Array.from(map.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [avatars, gender, query]);

  const looks = person ? (avatars.filter((a) => a.person === person)) : [];

  return (
    <div className="pl-root">
      <div className="pl-head">
        <div>
          <span className="cs-eyebrow">HeyGen presenter library</span>
          <h2 id="pl-title">Choose a presenter</h2>
          <p>{avatars.length.toLocaleString()} looks across {new Set(avatars.map((a) => a.person)).size} people. Filmed actors, so gestures and body language are built in.</p>
        </div>
        <button type="button" className="cs-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="pl-filters">
        <input className="cs-input" placeholder="Search by name or setting — office, sofa, casual…" value={query} onChange={(e) => { setQuery(e.target.value); setPerson(null); }} aria-label="Search presenters" />
        <div className="pl-segment" role="group" aria-label="Filter by gender">
          {(["all", "female", "male"] as const).map((g) => (
            <button type="button" key={g} aria-pressed={gender === g} onClick={() => { setGender(g); setPerson(null); }}>
              {g === "all" ? "Everyone" : g === "female" ? "Women" : "Men"}
            </button>
          ))}
        </div>
      </div>
      {person ? (
        <div className="pl-looks">
          <button type="button" className="cs-text-button" onClick={() => setPerson(null)}>← All presenters</button>
          <h3>{person} <span>{looks.length} {looks.length === 1 ? "look" : "looks"}</span></h3>
          <div className="pl-grid">
            {looks.map((a) => (
              <AvatarCard key={a.id} avatar={a} title={a.look} selected={a.id === selectedId} onClick={() => onSelect(a)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="pl-grid">
          {people.length === 0 ? <p className="pl-empty">No presenters match “{query}”.</p> : null}
          {people.map(([name, list]) => (
            <PersonCard key={name} name={name} looks={list} selected={list.some((a) => a.id === selectedId)} onClick={() => (list.length === 1 ? onSelect(list[0]!) : setPerson(name))} />
          ))}
        </div>
      )}
    </div>
  );
}

function AvatarCard({ avatar, title, subtitle, selected, onClick }: { avatar: LibraryAvatar; title: string; subtitle?: string; selected?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (hover) void v.play().catch(() => {});
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hover]);
  return (
    // A div, not a <button>: buttons give their children a shrink-to-fit anonymous box in
    // Chromium, which collapses aspect-ratio artwork to zero height.
    <div role="button" tabIndex={0} className="pl-tile pl-look" aria-pressed={selected} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className="pl-sheet solo">
        <span className="pl-cell pl-hero">
          {avatar.previewUrl ? <img src={avatar.previewUrl} alt="" loading="lazy" /> : <span className="pl-initial">{title.slice(0, 1)}</span>}
          {avatar.previewVideoUrl ? <video ref={video} src={avatar.previewVideoUrl} muted playsInline preload="none" loop className={hover ? "on" : ""} /> : null}
        </span>
        {selected ? <span className="pl-check">✓</span> : null}
      </span>
      <span className="pl-caption">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </div>
  );
}

/** A person: hero portrait plus two stacked looks — three tiles, like a contact sheet. */
function PersonCard({ name, looks, selected, onClick }: { name: string; looks: LibraryAvatar[]; selected?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const hero = looks[0]!;
  const rest = looks.slice(1, 3);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (hover) void v.play().catch(() => {});
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hover]);
  return (
    <div role="button" tabIndex={0} className="pl-tile" aria-pressed={selected} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className={`pl-sheet n${rest.length}`}>
        <span className="pl-cell pl-hero">
          {hero.previewUrl ? <img src={hero.previewUrl} alt="" loading="lazy" /> : <span className="pl-initial">{name.slice(0, 1)}</span>}
          {hero.previewVideoUrl ? <video ref={video} src={hero.previewVideoUrl} muted playsInline preload="none" loop className={hover ? "on" : ""} /> : null}
        </span>
        {rest.map((l) => (
          <span key={l.id} className="pl-cell">
            {l.previewUrl ? <img src={l.previewUrl} alt="" loading="lazy" /> : null}
          </span>
        ))}
        {selected ? <span className="pl-check">✓</span> : null}
      </span>
      <span className="pl-caption">
        <strong>{name}</strong>
        <small>{looks.length} {looks.length === 1 ? "look" : "looks"}</small>
      </span>
    </div>
  );
}
