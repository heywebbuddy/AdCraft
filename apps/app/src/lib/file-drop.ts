"use client";

import { useState, type DragEvent } from "react";

/**
 * Drag-and-drop for any upload field. Spread `props` on the element that wraps the
 * `<input type="file">`: a dropped file is put on that input and a `change` event fired,
 * so the same onChange / form submission path runs as for a click. Files that don't match
 * the input's `accept` are ignored (the field just stops highlighting).
 */
export function useFileDrop() {
  const [over, setOver] = useState(false);
  const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const props = {
    onDragEnter: (e: DragEvent<HTMLElement>) => {
      if (!has(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!has(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!over) setOver(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!has(e)) return;
      e.preventDefault();
      setOver(false);
      const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
      const file = Array.from(e.dataTransfer.files).find((f) => accepts(f, input?.accept ?? ""));
      if (!input || !file) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
  };
  return { over, props };
}

function accepts(file: File, accept: string) {
  const rules = accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((r) => (r.startsWith(".") ? name.endsWith(r) : r.endsWith("/*") ? type.startsWith(r.slice(0, -1)) : type === r));
}
