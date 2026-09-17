/** Shared, deterministic story templates; no invented testimonials or product claims. */
export const CHARACTER_TEMPLATES = [
  { id: "introduction", name: "Meet your next everyday essential", description: "Introduction → product → invitation", icon: "✦" },
  { id: "details", name: "Let the details do the talking", description: "Curiosity → close-ups → invitation", icon: "◎" },
  { id: "question", name: "Start with a question", description: "Question → answer → invitation", icon: "?" },
  { id: "explainer", name: "Make it easy to understand", description: "Context → explanation → next step", icon: "↗" },
  { id: "launch", name: "Introduce something new", description: "Announcement → introduction → invitation", icon: "+" },
  { id: "discovery", name: "A closer look", description: "Discovery → detail → explore", icon: "◌" },
] as const;
export type CharacterTemplateId = typeof CHARACTER_TEMPLATES[number]["id"];
export function hookVariations(name: string, template: string) {
  switch (template) {
    case "question": return [`Curious about ${name}? Let's take a look.`, `Could ${name} be right for you?`, `What should you know about ${name}?`];
    case "details": return [`Let's take a closer look at ${name}.`, `It's all in the details. Meet ${name}.`, `Here's your close-up of ${name}.`];
    case "explainer": return [`Here's ${name}, explained simply.`, `Let's get to know ${name}.`, `A quick introduction to ${name}.`];
    case "launch": return [`Introducing ${name}.`, `Say hello to ${name}.`, `Meet ${name}. Here's what to know.`];
    case "discovery": return [`Have a look at ${name}.`, `Something to explore: ${name}.`, `Let's discover ${name} together.`];
    default: return [`Meet ${name}, your next everyday possibility.`, `Make room for ${name}.`, `Here's an introduction to ${name}.`];
  }
}
/** One sentence per line: each line becomes a scene with its own caption, so nothing is truncated on screen. */
export function studioScript(hook: string, body: string, cta: string) {
  const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(x => x.trim()).filter(Boolean);
  return [hook.trim(), ...sentences(body), cta.trim()].filter(Boolean).join("\n");
}
export function estimatedStudioSeconds(script: string) { return Math.max(5, Math.ceil(script.trim().split(/\s+/).filter(Boolean).length / 2.5) + 3); }
