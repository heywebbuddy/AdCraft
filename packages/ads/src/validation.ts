import { ratioToNumber, validateText, type PlacementSpec } from "@adcraft/specs";
import type { Creative, Platform, ValidationIssue } from "./types";

/**
 * Spec + policy pre-check shared by every adapter (PLAN.md section 3, Release 4:
 * "text length, safe zones, restricted claims, AI content disclosure. Hard failures block
 * publish, soft ones warn"). Adapters layer platform-specific rules on top.
 */
export function validateCreative(platform: Platform, creative: Creative, placement: PlacementSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Media kind.
  if (!placement.media.includes(creative.kind)) {
    issues.push({ level: "error", code: "media", message: `${placement.label} does not accept ${creative.kind} creative.` });
  }

  // Ratio (within 1.5%).
  const want = ratioToNumber(placement.ratio);
  const have = creative.width / creative.height;
  if (!(creative.width > 0 && creative.height > 0) || Math.abs(have - want) / want > 0.015) {
    issues.push({
      level: "error",
      code: "ratio",
      message: `Needs ${placement.ratio}; this file is ${creative.width}×${creative.height}.`,
    });
  } else if (creative.width < placement.width * 0.75) {
    issues.push({
      level: "warning",
      code: "ratio",
      message: `Below the recommended ${placement.width}×${placement.height}; the platform may upscale it.`,
    });
  }

  // File size.
  const maxMb = creative.kind === "video" ? placement.maxFileMb.video : placement.maxFileMb.image;
  if (maxMb && creative.fileBytes > maxMb * 1024 * 1024) {
    issues.push({ level: "error", code: "file_size", message: `File is ${(creative.fileBytes / 1024 / 1024).toFixed(1)} MB; the limit is ${maxMb} MB.` });
  }

  // Duration.
  if (creative.kind === "video" && placement.maxDurationSec && creative.durationSec && creative.durationSec > placement.maxDurationSec) {
    issues.push({ level: "error", code: "duration", message: `Video is ${creative.durationSec}s; the limit is ${placement.maxDurationSec}s.` });
  }

  // Copy.
  if (!creative.headline?.trim()) issues.push({ level: "warning", code: "missing_copy", field: "headline", message: "No headline set; the platform will show the page title." });
  if (!creative.primaryText?.trim() && platform !== "google") issues.push({ level: "warning", code: "missing_copy", field: "primaryText", message: "No primary text." });

  const textIssues = validateText(placement, {
    headline: creative.headline,
    primaryText: creative.primaryText,
    description: creative.description,
  });
  for (const t of textIssues) {
    // Meta truncates long primary text behind "See more" (soft); every other over-limit field is rejected outright.
    const soft = platform === "meta" && t.field === "primaryText";
    issues.push({
      level: soft ? "warning" : "error",
      code: "text_length",
      field: t.field,
      message: `${label(t.field)} is ${t.length} characters; ${soft ? "text after" : "the limit is"} ${t.max}${soft ? " is hidden behind “See more”." : "."}`,
    });
  }

  // Landing page.
  if (!/^https?:\/\/\S+$/i.test(creative.landingUrl ?? "")) {
    issues.push({ level: "error", code: "landing_url", message: "A full landing URL (https://…) is required." });
  }

  // AI disclosure (Meta and TikTok require labels for realistic AI-generated people; both accept the flag on upload).
  if (creative.aiRealisticPeople && (platform === "meta" || platform === "tiktok")) {
    issues.push({ level: "warning", code: "ai_disclosure", message: "Contains an AI-generated person — it will be published with the platform's AI label." });
  } else if (creative.aiGenerated && platform !== "google") {
    issues.push({ level: "warning", code: "ai_disclosure", message: "AI-generated scene — labelled as AI-assisted on publish." });
  }

  return issues;
}

function label(field: string) {
  return field === "primaryText" ? "Primary text" : field[0]!.toUpperCase() + field.slice(1);
}

export function hasErrors(issues: ValidationIssue[]) {
  return issues.some((i) => i.level === "error");
}
