import type { StaticTemplate } from "@adcraft/render";

/**
 * Pure-CSS miniature of each static template (4:5). Used by the template picker
 * on /creatives/new and the editor. Colours follow the brand kit passed in.
 */
export function TemplateThumb({
  template,
  colors,
  className = "",
}: {
  template: StaticTemplate;
  colors: { primary: string; accent: string };
  className?: string;
}) {
  const scene = "linear-gradient(160deg, #fbe7cf 0%, #f0b489 45%, #b9552f 100%)";
  const overlay = "linear-gradient(0deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 60%)";
  const bar = (w: string, h = "6%") => ({ width: w, height: h, borderRadius: 2 });
  const bottle = (w: string, h: string) => (
    <span className="absolute rounded-[3px] bg-white/95 shadow-[0_2px_6px_rgba(0,0,0,.25)]" style={{ width: w, height: h, right: "10%", bottom: "30%" }}>
      <span className="absolute left-1/2 top-[-8%] h-[10%] w-[45%] -translate-x-1/2 rounded-[2px] bg-[#2b2a26]" />
      <span className="absolute left-1/2 top-[38%] h-[28%] w-[55%] -translate-x-1/2 rounded-[1px]" style={{ background: colors.accent }} />
    </span>
  );

  if (template === "split") {
    return (
      <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[6px] ${className}`} style={{ background: colors.primary }}>
        <span className="absolute inset-x-0 top-0 h-[54%]" style={{ background: scene }} />
        <span className="absolute left-1/2 top-[14%] h-[40%] w-[26%] -translate-x-1/2 rounded-[3px] bg-white/95 shadow-[0_2px_6px_rgba(0,0,0,.25)]">
          <span className="absolute left-1/2 top-[-8%] h-[10%] w-[45%] -translate-x-1/2 rounded-[2px] bg-[#2b2a26]" />
          <span className="absolute left-1/2 top-[38%] h-[28%] w-[55%] -translate-x-1/2" style={{ background: colors.accent }} />
        </span>
        <span className="absolute left-[8%] top-[6%] flex items-center gap-[3px]">
          <span className="h-[4px] w-[4px] rounded-full" style={{ background: colors.accent }} />
          <span className="h-[4px] w-[16px] rounded-[1px] bg-white/80" />
        </span>
        <span className="absolute inset-x-[8%] bottom-[8%] flex flex-col gap-[5px]">
          <span className="bg-white/95" style={bar("78%")} />
          <span className="bg-white/95" style={bar("56%")} />
          <span className="mt-[2px] bg-white/60" style={bar("64%", "3.5%")} />
          <span className="mt-[3px] rounded-full" style={{ ...bar("32%", "8%"), borderRadius: 999, background: colors.accent }} />
        </span>
      </span>
    );
  }

  if (template === "minimal") {
    return (
      <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[6px] ${className}`} style={{ background: scene }}>
        <span className="absolute inset-0 bg-black/25" />
        <span className="absolute left-1/2 top-[7%] flex -translate-x-1/2 items-center gap-[3px]">
          <span className="h-[4px] w-[4px] rounded-full" style={{ background: colors.accent }} />
          <span className="h-[4px] w-[16px] rounded-[1px] bg-white/80" />
        </span>
        <span className="absolute inset-x-[16%] top-[15%] flex flex-col items-center gap-[4px]">
          <span className="rounded-[2px] bg-white/95" style={{ width: "80%", height: 5 }} />
          <span className="rounded-[2px] bg-white/95" style={{ width: "48%", height: 5 }} />
          <span className="mt-[2px] rounded-[2px] bg-white/60" style={{ width: "60%", height: 3 }} />
        </span>
        <span className="absolute left-1/2 top-[38%] h-[34%] w-[24%] -translate-x-1/2 rounded-[3px] bg-white/95 shadow-[0_2px_6px_rgba(0,0,0,.25)]">
          <span className="absolute left-1/2 top-[-8%] h-[10%] w-[45%] -translate-x-1/2 rounded-[2px] bg-[#2b2a26]" />
          <span className="absolute left-1/2 top-[38%] h-[28%] w-[55%] -translate-x-1/2" style={{ background: colors.accent }} />
        </span>
        <span className="absolute bottom-[8%] left-1/2 h-[7%] w-[30%] -translate-x-1/2 rounded-full" style={{ background: colors.accent }} />
      </span>
    );
  }

  if (template === "bold") {
    return (
      <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[6px] ${className}`} style={{ background: scene }}>
        <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 55%)" }} />
        <span className="absolute inset-0" style={{ background: overlay }} />
        <span className="absolute left-[8%] top-[6%] flex items-center gap-[3px]">
          <span className="h-[4px] w-[4px] rounded-full" style={{ background: colors.accent }} />
          <span className="h-[4px] w-[16px] rounded-[1px] bg-white/80" />
        </span>
        <span className="absolute inset-x-[8%] top-[15%] flex flex-col gap-[4px]">
          <span className="bg-white/95" style={bar("86%", "9%")} />
          <span className="bg-white/95" style={bar("70%", "9%")} />
          <span className="bg-white/95" style={bar("52%", "9%")} />
        </span>
        <span className="absolute left-1/2 top-[50%] h-[36%] w-[30%] -translate-x-1/2 rounded-[3px] bg-white/95 shadow-[0_2px_6px_rgba(0,0,0,.25)]">
          <span className="absolute left-1/2 top-[-8%] h-[10%] w-[45%] -translate-x-1/2 rounded-[2px] bg-[#2b2a26]" />
          <span className="absolute left-1/2 top-[38%] h-[28%] w-[55%] -translate-x-1/2" style={{ background: colors.accent }} />
        </span>
        <span className="absolute bottom-[6%] left-1/2 h-[7%] w-[34%] -translate-x-1/2 rounded-full" style={{ background: colors.accent }} />
      </span>
    );
  }

  // hero
  return (
    <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[6px] ${className}`} style={{ background: scene }}>
      <span className="absolute inset-0" style={{ background: overlay }} />
      <span className="absolute left-[8%] top-[6%] flex items-center gap-[3px]">
        <span className="h-[4px] w-[4px] rounded-full" style={{ background: colors.accent }} />
        <span className="h-[4px] w-[16px] rounded-[1px] bg-white/80" />
      </span>
      {bottle("28%", "38%")}
      <span className="absolute inset-x-[8%] bottom-[8%] flex flex-col gap-[5px]">
        <span className="bg-white/95" style={bar("74%")} />
        <span className="bg-white/95" style={bar("52%")} />
        <span className="mt-[2px] bg-white/60" style={bar("60%", "3.5%")} />
        <span className="mt-[3px]" style={{ ...bar("32%", "8%"), borderRadius: 999, background: colors.accent }} />
      </span>
    </span>
  );
}
