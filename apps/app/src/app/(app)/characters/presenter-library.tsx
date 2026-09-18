"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PresenterGroup, PresenterLook } from "@/server/presenter-library";

export type { PresenterGroup, PresenterLook };

/** What the picker hands back: the look (the `avatar_id`) plus its person for display. */
export type PresenterChoice = { look: PresenterLook; person: PresenterGroup };

type Kind = "all" | "studio" | "photo" | "twin";

/** Looks fetched this session, shared by every picker instance (page tab, dialog). */
const lookCache = new Map<string, PresenterLook[]>();
const KINDS: Array<{ id: Kind; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Everything in HeyGen's public library" },
  { id: "studio", label: "Filmed studio", hint: "Real actors filmed in a studio — gestures are in the footage" },
  { id: "photo", label: "AI avatars", hint: "Photo avatars — many settings and outfits, animated with Avatar IV / V" },
  { id: "twin", label: "Digital twins", hint: "Video-trained avatars with reference-driven motion" },
];

/**
 * HeyGen's public presenter library (v3): ~1,400 people, ~25,000 looks. People come from
 * the server; a person's looks load on demand (a shared cache keeps them for the session)
 * — first when the tile scrolls into view (for the contact-sheet thumbnails), then when
 * the person is opened.
 */
export function PresenterLibrary({
  groups,
  loadLooks,
  selectedId,
  ratio,
  onSelect,
  onClose,
  mode = "dialog",
}: {
  groups: PresenterGroup[];
  loadLooks: (groupId: string) => Promise<PresenterLook[]>;
  selectedId?: string;
  /** The ad's size, to flag looks that suit it. */
  ratio?: string;
  onSelect: (choice: PresenterChoice) => void;
  onClose?: () => void;
  /** "page" renders as a browsable section (no close, page scroll, stats) instead of a modal. */
  mode?: "dialog" | "page";
}) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [kind, setKind] = useState<Kind>("all");
  const [person, setPerson] = useState<PresenterGroup | null>(null);
  const [looks, setLooks] = useState<Record<string, PresenterLook[]>>(() => Object.fromEntries(lookCache));
  const [fitOnly, setFitOnly] = useState(false);
  const pending = useRef(new Set<string>());

  const fetchLooks = (id: string, force = false) => {
    if ((looks[id] && !force) || pending.current.has(id)) return;
    pending.current.add(id);
    loadLooks(id)
      .then((list) => { lookCache.set(id, list); setLooks((prev) => ({ ...prev, [id]: list })); })
      // A failed or aborted call is not cached, so opening the person tries again.
      .catch(() => undefined)
      .finally(() => pending.current.delete(id));
  };

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => (gender === "all" || g.gender === gender) && (kind === "all" || g.kind === kind) && (!q || g.name.toLowerCase().includes(q)));
  }, [groups, gender, kind, query]);

  const wanted: "portrait" | "landscape" | "square" | null = ratio === "9:16" || ratio === "4:5" ? "portrait" : ratio === "1:1" ? "square" : ratio === "16:9" ? "landscape" : null;
  const personLooksAll = person ? looks[person.id] : undefined;
  const personLooks = personLooksAll && fitOnly && wanted ? personLooksAll.filter((l) => l.orientation === wanted) : personLooksAll;
  const fitCount = personLooksAll && wanted ? personLooksAll.filter((l) => l.orientation === wanted).length : 0;

  const page = mode === "page";
  const totals = useMemo(() => ({ looks: groups.reduce((n, g) => n + g.looksCount, 0), studio: groups.filter((g) => g.kind === "studio").length, twin: groups.filter((g) => g.kind === "twin").length, photo: groups.filter((g) => g.kind === "photo").length }), [groups]);

  return (
    <div className={`pl-root ${page ? "pl-page" : ""}`}>
      <div className="pl-head">
        <div>
          <span className="cs-eyebrow">Cast library · HeyGen</span>
          <h2 id={page ? undefined : "pl-title"}>{page ? "Browse the cast" : "Choose a presenter"}</h2>
          <p>
            {groups.length.toLocaleString()} people · {totals.looks.toLocaleString()} looks. {page ? "Real actors filmed in a studio, AI avatars in many settings, and video-trained digital twins — licensed for your ads." : "Pick a person, then the outfit and setting."}
          </p>
        </div>
        {page ? (
          <dl className="pl-stats" aria-label="Library breakdown">
            {(["studio", "photo", "twin"] as const).map((k) => (
              <button type="button" key={k} className="pl-stat" aria-pressed={kind === k} onClick={() => { setKind(kind === k ? "all" : k); setPerson(null); }}>
                <dt>{k === "studio" ? "Filmed" : k === "photo" ? "AI avatars" : "Digital twins"}</dt>
                <dd>{totals[k].toLocaleString()}</dd>
              </button>
            ))}
          </dl>
        ) : (
          <button type="button" className="cs-close" onClick={onClose} aria-label="Close">×</button>
        )}
      </div>
      <div className="pl-filters">
        <input className="cs-input" placeholder="Search by name…" value={query} onChange={(e) => { setQuery(e.target.value); setPerson(null); }} aria-label="Search presenters" />
        <div className="pl-segment" role="group" aria-label="Filter by gender">
          {(["all", "female", "male"] as const).map((g) => (
            <button type="button" key={g} aria-pressed={gender === g} onClick={() => { setGender(g); setPerson(null); }}>
              {g === "all" ? "Everyone" : g === "female" ? "Women" : "Men"}
            </button>
          ))}
        </div>
      </div>
      <div className="pl-chips" role="group" aria-label="Avatar type">
        {KINDS.map((k) => (
          <button type="button" key={k.id} aria-pressed={kind === k.id} title={k.hint} onClick={() => { setKind(k.id); setPerson(null); }}>
            {k.label}
          </button>
        ))}
        <span className="pl-chips-hint">{KINDS.find((k) => k.id === kind)?.hint}</span>
      </div>

      {person ? (
        <div className="pl-looks">
          <button type="button" className="cs-text-button" onClick={() => setPerson(null)}>← All presenters</button>
          <div className="pl-looks-head">
            <h3>
              {person.name.trim() || "Unnamed presenter"} <span>{(personLooksAll?.length ?? person.looksCount)} {(personLooksAll?.length ?? person.looksCount) === 1 ? "look" : "looks"}</span>
            </h3>
            {wanted && personLooksAll ? (
              <label className="pl-fit-toggle">
                <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /> Only looks that fit {ratio} <span>{fitCount}</span>
              </label>
            ) : null}
          </div>
          {!personLooks ? (
            <p className="pl-empty">Loading looks…</p>
          ) : personLooks.length === 0 ? (
            <p className="pl-empty">No {ratio} looks for {person.name} — untick the filter to see the rest.</p>
          ) : (
            <div className="pl-grid">
              {personLooks.map((l) => (
                <LookTile key={l.id} look={l} selected={l.id === selectedId} recommended={wanted !== null && l.orientation === wanted} onClick={() => onSelect({ look: l, person })} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pl-grid">
          {people.length === 0 ? <p className="pl-empty">No presenters match.</p> : null}
          {people.slice(0, 400).map((g) => (
            <PersonTile key={g.id} group={g} looks={looks[g.id]} onVisible={() => fetchLooks(g.id)} selected={Boolean(looks[g.id]?.some((l) => l.id === selectedId))} onClick={() => { fetchLooks(g.id, g.looksCount > 0 && looks[g.id]?.length === 0); setPerson(g); }} />
          ))}
          {people.length > 400 ? <p className="pl-empty">Showing the first 400 — search to narrow down.</p> : null}
        </div>
      )}
    </div>
  );
}

function useHoverVideo(hover: boolean) {
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
  return video;
}

/** A person: hero portrait plus two stacked looks (filled in once the looks have loaded). */
function PersonTile({ group, looks, selected, onVisible, onClick }: { group: PresenterGroup; looks?: PresenterLook[]; selected?: boolean; onVisible: () => void; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const video = useHoverVideo(hover);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        onVisible();
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);
  const hero = looks?.[0];
  const heroImg = hero?.previewUrl ?? group.previewUrl;
  const rest = (looks ?? []).filter((l) => l.previewUrl && l.previewUrl !== heroImg).slice(0, 2);
  // Before the looks arrive, show skeleton cells for the thumbnails we expect; after, only real ones.
  const n = looks ? rest.length : Math.min(2, Math.max(0, group.looksCount - 1));
  return (
    <div ref={ref} role="button" tabIndex={0} className="pl-tile" aria-pressed={selected} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className={`pl-sheet n${n}`}>
        <span className="pl-cell pl-hero">
          {heroImg ? <img src={heroImg} alt="" loading="lazy" /> : <span className="pl-initial">{group.name.slice(0, 1)}</span>}
          {hero?.previewVideoUrl ? <video ref={video} src={hero.previewVideoUrl} muted playsInline preload="none" loop className={hover ? "on" : ""} /> : null}
        </span>
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className="pl-cell">
            {rest[i]?.previewUrl ? <img src={rest[i]!.previewUrl!} alt="" loading="lazy" /> : null}
          </span>
        ))}
        {selected ? <span className="pl-check">✓</span> : null}
        <span className={`pl-kind ${group.kind}`}>{group.kind === "studio" ? "Filmed" : group.kind === "twin" ? "Twin" : "AI"}</span>
      </span>
      <span className="pl-caption">
        <strong>{group.name.trim() || "Unnamed presenter"}</strong>
        <small>
          {group.looksCount} {group.looksCount === 1 ? "look" : "looks"}
        </small>
      </span>
    </div>
  );
}

function LookTile({ look, selected, recommended, onClick }: { look: PresenterLook; selected?: boolean; recommended?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const video = useHoverVideo(hover);
  const orientation = look.orientation === "portrait" ? "Portrait" : look.orientation === "landscape" ? "Landscape" : look.orientation === "square" ? "Square" : null;
  return (
    <div role="button" tabIndex={0} className="pl-tile pl-look" aria-pressed={selected} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className={`pl-sheet solo ${look.orientation === "landscape" ? "wide" : ""}`}>
        <span className="pl-cell pl-hero">
          {look.previewUrl ? <img src={look.previewUrl} alt="" loading="lazy" /> : <span className="pl-initial">{look.name.slice(0, 1)}</span>}
          {look.previewVideoUrl ? <video ref={video} src={look.previewVideoUrl} muted playsInline preload="none" loop className={hover ? "on" : ""} /> : null}
        </span>
        {selected ? <span className="pl-check">✓</span> : null}
        {recommended ? <span className="pl-fit">Fits this size</span> : null}
      </span>
      <span className="pl-caption">
        <strong>{look.name}</strong>
        <small>{[orientation, look.engines.includes("avatar_v") ? "Avatar V" : null].filter(Boolean).join(" · ")}</small>
      </span>
    </div>
  );
}
