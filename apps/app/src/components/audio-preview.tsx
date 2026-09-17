"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A small branded audio player: orange play button, a thin scrubber that fills as it
 * plays, and a tabular time readout. Replaces the browser's default `<audio controls>`
 * wherever a voice preview or voice-over is shown. Styles live in workspace.css (.audio-*).
 */
export function AudioPreview({ src, label, compact }: { src: string; label?: string; compact?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", () => setPlaying(false));
    el.addEventListener("play", () => setPlaying(true));
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div className={`audio-preview${compact ? " compact" : ""}`} role="group" aria-label={label ?? "Audio preview"}>
      <audio ref={ref} src={src} preload="metadata" />
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"} aria-pressed={playing}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>
      <div className="audio-track" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}
        onKeyDown={(e) => {
          const el = ref.current;
          if (!el) return;
          if (e.key === "ArrowRight") el.currentTime = Math.min(duration, el.currentTime + 2);
          if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 2);
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="audio-fill" style={{ width: `${pct}%` }} />
        <span className="audio-knob" style={{ left: `${pct}%` }} />
      </div>
      <span className="audio-time tabular">
        {fmt(time)}
        {duration ? <span className="audio-total"> / {fmt(duration)}</span> : null}
      </span>
      {label && !compact ? <span className="audio-label">{label}</span> : null}
    </div>
  );
}
