import "server-only";
import { getCatalog } from "./model-catalog";

export const STATIC_PLACEMENTS = [
  "meta.feed.1x1",
  "meta.feed.4x5",
  "meta.stories.9x16",
  "youtube.instream.16x9",
] as const;

export async function staticModelChoices() {
  const c = await getCatalog();
  const def = c.default("image").id;
  return c.list("image").map((m) => ({
    id: m.id,
    label: m.label,
    notes: m.notes ?? "",
    isDefault: m.id === def,
    provider: m.provider,
    enabled: m.enabled !== false,
    configured: m.connected,
    credits: m.credits,
  }));
}
