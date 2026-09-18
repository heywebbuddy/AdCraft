"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Spark } from "./spark";
import { activityAction } from "@/server/activity-actions";
import type { ActivityItem } from "@/server/activity";

/**
 * Topbar bell for long jobs: a live count while anything runs, a dropdown listing running
 * and recently finished work with links. Polls every 5 s while something runs, every 30 s
 * otherwise, and refreshes on route change. Styles: workspace.css (.act-*).
 */
const KIND_LABEL: Record<ActivityItem["kind"], string> = { concepts: "Concepts", static: "Static ad", video: "Product video", ugc: "Presenter video", character: "Character", looks: "Looks", avatar: "Avatar", publish: "Publish", other: "Job" };

function ago(d: Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function ActivityTray({ initialRunning }: { initialRunning: number }) {
  const [data, setData] = useState<{ running: ActivityItem[]; recent: ActivityItem[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [seenDone, setSeenDone] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const running = data ? data.running.length : initialRunning;

  useEffect(() => {
    let alive = true;
    const tick = () => activityAction().then((d) => {
      if (!alive) return;
      setData((prev) => {
        if (prev) {
          const newlyDone = d.recent.filter((r) => !prev.recent.some((p) => p.id === r.id) && prev.running.some((p) => p.id === r.id));
          if (newlyDone.length) setUnread((n) => n + newlyDone.length);
        }
        return d;
      });
    }).catch(() => undefined);
    void tick();
    const every = running > 0 ? 5000 : 30000;
    const t = setInterval(tick, every);
    return () => { alive = false; clearInterval(t); };
  }, [running, pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => { setOpen((o) => !o); setUnread(0); if (data) setSeenDone(new Set(data.recent.map((r) => r.id))); };

  return (
    <div className="act-root" ref={box}>
      <button type="button" className={`act-btn ${running ? "busy" : ""}`} aria-expanded={open} aria-label={running ? `${running} running` : "Activity"} onClick={toggle}>
        {running ? <Spark size={14} animate="spin" /> : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></svg>}
        <span>{running ? `${running} running` : "Activity"}</span>
        {unread > 0 && !open ? <i className="act-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="act-pop" role="dialog" aria-label="Activity">
          <div className="act-head"><strong>Activity</strong><span>{running ? `${running} running` : "Nothing running"}</span></div>
          {data?.running.length ? <ul className="act-list">{data.running.map((i) => <Row key={i.id} item={i} onNav={() => setOpen(false)} />)}</ul> : null}
          {data?.recent.length ? <><div className="act-sub">Last 24 hours</div><ul className="act-list">{data.recent.map((i) => <Row key={i.id} item={i} fresh={!seenDone.has(i.id)} onNav={() => setOpen(false)} />)}</ul></> : null}
          {data && !data.running.length && !data.recent.length ? <p className="act-empty">Long jobs — concepts, ads, videos, characters — show up here while they run and for a day after. We also email owners and editors when a video or character finishes.</p> : null}
          {!data ? <p className="act-empty">Loading…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ item, fresh, onNav }: { item: ActivityItem; fresh?: boolean; onNav: () => void }) {
  return (
    <li className={`act-row ${item.status} ${fresh ? "fresh" : ""}`}>
      <Link href={item.href} onClick={onNav}>
        <span className={`act-status ${item.status}`} aria-hidden="true">{item.status === "running" ? <Spark size={11} animate="spin" /> : item.status === "succeeded" ? "✓" : "!"}</span>
        <span className="act-text">
          <strong>{item.title}</strong>
          <small>{KIND_LABEL[item.kind]}{item.detail ? ` · ${item.detail}` : ""}{item.status === "running" ? ` · started ${ago(item.startedAt)}` : item.finishedAt ? ` · ${ago(item.finishedAt)}` : ""}</small>
        </span>
        <span className="act-arrow" aria-hidden="true">→</span>
      </Link>
    </li>
  );
}
