"use client";

import { useEffect, useMemo, useState } from "react";
import type { BulkBrief } from "@/server/bulk-data";

const kindLabel: Record<string, string> = { static: "Static", video: "Video", ugc: "UGC" };

/**
 * Checkbox list of concepts grouped by brief. Keeps the selection count in sync with the
 * estimate in the sidebar (which lives in the same <form>), without owning the form.
 */
export function BulkPicker({ briefs }: { briefs: BulkBrief[] }) {
  const all = useMemo(() => briefs.flatMap((b) => b.concepts.map((c) => c.id)), [briefs]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(briefs.flatMap((b) => b.concepts.filter((c) => c.status === "selected").map((c) => c.id))));

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-bulk="estimate"]');
    if (!el) return;
    const update = () => {
      const templates = document.querySelectorAll<HTMLInputElement>('input[data-bulk="template"]:checked').length;
      const n = picked.size * templates;
      const credits = n * Number(el.dataset.credits ?? 2);
      el.textContent = `${n} creative${n === 1 ? "" : "s"} · ${credits} credits`;
    };
    update();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[data-bulk="template"]');
    inputs.forEach((i) => i.addEventListener("change", update));
    return () => inputs.forEach((i) => i.removeEventListener("change", update));
  }, [picked]);

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">
          Concepts · {picked.size} of {all.length} selected
        </span>
        <div className="flex gap-1 rounded-[7px] border border-line bg-surface p-[3px] text-[12px] font-medium">
          <button type="button" onClick={() => setPicked(new Set(all))} className="inline-flex min-h-8 items-center rounded-[5px] px-3 text-ink hover:bg-paper">
            Select all
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="inline-flex min-h-8 items-center rounded-[5px] px-3 text-ink hover:bg-paper">
            None
          </button>
        </div>
      </div>

      {briefs.map((b) => (
        <section key={b.id} className="panel flex flex-col">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <span className="text-[14px] font-semibold">{b.title}</span>
            <span className="text-[11px] text-muted">
              {b.concepts.length} concept{b.concepts.length === 1 ? "" : "s"} · {b.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
          {b.concepts.length === 0 ? (
            <p className="m-0 px-4 py-3 text-[13px] text-muted">No concepts yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {b.concepts.map((c) => {
                const on = picked.has(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-[13px] hover:bg-paper ${on ? "bg-[#fbf3ef]" : ""}`}>
                      <input type="checkbox" name="conceptIds" value={c.id} checked={on} onChange={(e) => toggle(c.id, e.target.checked)} className="mt-1 accent-[#e65c32]" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold">{c.title}</span>
                          <span className="rounded bg-well px-1.5 py-px text-[10px] font-semibold text-ink">{kindLabel[c.kind] ?? c.kind}</span>
                          {c.status === "selected" ? <span className="text-[11px] text-[#3f7a55]">already used</span> : null}
                          {c.status === "rejected" ? <span className="text-[11px] text-muted">rejected</span> : null}
                        </span>
                        <span className="truncate text-muted">{c.headline}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
