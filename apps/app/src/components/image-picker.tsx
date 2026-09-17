"use client";

import { useEffect, useId, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

type Props = {
  name: string;
  accept: string;
  required?: boolean;
  /** Existing image to show before a new file is chosen. */
  currentUrl?: string | null;
  label?: string;
  hint?: string;
  /** Compact square variant for logos. */
  compact?: boolean;
  /** Called with a local object URL when a file is picked (null when cleared). */
  onPreview?: (url: string | null) => void;
};

/** File input with a local preview. Submits as a normal multipart field. */
export function ImagePicker({ name, accept, required, currentUrl, label = "Choose image", hint, compact, onPreview }: Props) {
  const id = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shown = preview ?? currentUrl ?? null;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-center justify-center overflow-hidden rounded-[7px] border border-dashed border-[#d4d3ca] bg-white text-center hover:border-ink ${
          compact ? "h-[120px] w-[120px]" : "min-h-[240px] w-full"
        }`}
        style={shown ? { backgroundImage: "linear-gradient(45deg,#f1f0ea 25%,transparent 25%,transparent 75%,#f1f0ea 75%),linear-gradient(45deg,#f1f0ea 25%,transparent 25%,transparent 75%,#f1f0ea 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" } : undefined}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={compact ? "max-h-[104px] max-w-[104px] object-contain" : "max-h-[360px] w-full object-contain p-3"} />
        ) : (
          <span className="flex flex-col items-center gap-1.5 p-4">
            <span className="text-[22px] leading-none text-orange">+</span>
            <span className="text-[13px] font-semibold">{label}</span>
            {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
          </span>
        )}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f && f.size > MAX_UPLOAD_BYTES) {
            // Reject here so the form never posts a body the server would refuse.
            e.currentTarget.value = "";
            setTooLarge(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB; the limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
            return;
          }
          setTooLarge(null);
          if (preview) URL.revokeObjectURL(preview);
          const url = f ? URL.createObjectURL(f) : null;
          setPreview(url);
          setFileName(f?.name ?? null);
          onPreview?.(url);
        }}
      />
      {tooLarge ? (
        <span role="alert" className="text-[11px] text-[#b3261e]">
          {tooLarge}
        </span>
      ) : fileName ? (
        <span className="truncate text-[11px] text-muted">{fileName}</span>
      ) : shown && !compact ? (
        <span className="text-[11px] text-muted">Click the image to replace it.</span>
      ) : null}
    </div>
  );
}
