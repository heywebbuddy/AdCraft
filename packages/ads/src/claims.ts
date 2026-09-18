import type { ValidationIssue } from "./types";

/**
 * Claims review for ad copy. Rule-based and instant, so it can run on every creative and
 * again at publish time. It flags the categories platforms and regulators actually reject:
 * health and medical outcomes, financial guarantees, absolute superlatives, "before/after"
 * and personal-attribute targeting. Hard failures block publishing; soft ones are shown and
 * left to the person. Brief constraints ("no medical claims") turn the matching soft rules
 * into hard ones.
 */
export type ClaimCategory = "medical" | "financial" | "superlative" | "guarantee" | "personal" | "urgency" | "profanity";

type Rule = { category: ClaimCategory; level: "error" | "warning"; re: RegExp; message: string };

const RULES: Rule[] = [
  { category: "medical", level: "error", re: /\b(cures?|curing|heals?|healing|treats?|treatment for|prevents?|reverses?|eliminates?)\b[^.]{0,40}\b(cancer|diabetes|depression|anxiety|covid|acne|eczema|arthritis|disease|illness|infection|adhd|insomnia|pain)\b/i, message: "Claims to cure, treat or prevent a medical condition are rejected by every platform." },
  { category: "medical", level: "warning", re: /\b(clinically (proven|tested)|doctor[- ]recommended|fda[- ]approved|dermatologist[- ]recommended|scientifically proven)\b/i, message: "\"Clinically proven\" / \"doctor recommended\" needs substantiation on file; Meta and Google ask for it." },
  { category: "medical", level: "warning", re: /\b(lose|shed|drop|melt)\s+(up to\s+)?\d+\s*(lbs?|pounds|kg|kilos)\b|\bweight[- ]loss\b|\bburns? fat\b/i, message: "Weight-loss results claims are restricted (Meta: no specific amounts; Google: certified advertisers only)." },
  { category: "financial", level: "error", re: /\b(guaranteed|guarantee)\b[^.]{0,30}\b(returns?|profits?|income|earnings|roi|results)\b|\brisk[- ]free (investment|returns?)\b/i, message: "Guaranteed financial returns are prohibited." },
  { category: "financial", level: "warning", re: /\b(get rich|make money fast|passive income|double your money|\d+% (returns?|apy|yield))\b/i, message: "Income and returns claims need disclaimers and often certification." },
  { category: "guarantee", level: "warning", re: /\b(100% (guaranteed|effective|safe|natural)|works? for everyone|never fails?|no side effects)\b/i, message: "Absolute guarantees invite rejection; soften or substantiate." },
  { category: "superlative", level: "warning", re: /\b(the )?(best|#1|number one|no\.\s?1|cheapest|fastest|safest|most effective|world'?s (best|first|only))\b/i, message: "Superlatives (\"best\", \"#1\") need proof or a qualifier (\"our best\", \"rated #1 by …\")." },
  { category: "personal", level: "error", re: /\b(are you|do you) (overweight|fat|ugly|depressed|broke|in debt|lonely|bald|struggling with)\b/i, message: "Implying knowledge of a person's attributes (weight, finances, health) is prohibited on Meta." },
  { category: "urgency", level: "warning", re: /\b(only \d+ left|last chance|act now|limited time only|offer ends (today|tonight|soon))\b/i, message: "False scarcity is policed; keep urgency truthful and specific." },
  { category: "profanity", level: "warning", re: /\b(fuck|shit|bitch|asshole|damn)\b/i, message: "Profanity is rejected by most placements." },
];

export type ClaimFinding = ValidationIssue & { category: ClaimCategory; excerpt: string };

/** Scan copy fields; `constraints` from the brief harden matching categories to errors. */
export function reviewClaims(copy: Record<string, string | undefined | null>, constraints: string[] = []): ClaimFinding[] {
  const hardened = new Set<ClaimCategory>();
  for (const c of constraints) {
    const s = c.toLowerCase();
    if (/medical|health/.test(s)) hardened.add("medical");
    if (/financial|income|returns?/.test(s)) hardened.add("financial");
    if (/superlative|best|#1/.test(s)) hardened.add("superlative");
    if (/guarantee/.test(s)) hardened.add("guarantee");
  }
  const out: ClaimFinding[] = [];
  const seen = new Set<string>();
  for (const [field, raw] of Object.entries(copy)) {
    const text = (raw ?? "").toString();
    if (!text) continue;
    for (const r of RULES) {
      const m = text.match(r.re);
      if (!m) continue;
      const key = `${r.category}:${m[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ level: hardened.has(r.category) ? "error" : r.level, code: "claims", message: `${r.message} (${field}: “${m[0]}”)`, category: r.category, excerpt: m[0] });
    }
  }
  return out;
}
