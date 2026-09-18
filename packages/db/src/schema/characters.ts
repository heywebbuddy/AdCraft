import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { brands } from "./brands";

export type CharacterLook = {
  id: string;
  name: string;
  imageKey: string;
  prompt: string;
  model: string;
  /** Set when the look lives on HeyGen (look pack / template / prompt): rendered as `avatar_id`, not from the image. */
  heygenLookId?: string;
  /** Which pack or template produced it, for grouping in the UI. */
  packId?: string;
};

/** The character as HeyGen knows it, once a portrait has been registered as a photo avatar. */
export type CharacterHeyGen = { groupId?: string; lookId?: string };

/** Private, reusable synthetic identities. Looks retain their original reference and model. */
export const characters = pgTable("characters", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  personality: text("personality").notNull().default("Warm and conversational"),
  voiceId: text("voice_id").notNull(),
  imageModel: text("image_model").notNull(),
  portraitKey: text("portrait_key"),
  /** Photo-avatar motion: expressiveness (low | medium | high) and free-text gesture notes. */
  motion: jsonb("motion").$type<{ expressiveness?: "low" | "medium" | "high"; prompt?: string }>().notNull().default({}),
  looks: jsonb("looks").$type<CharacterLook[]>().notNull().default([]),
  heygen: jsonb("heygen").$type<CharacterHeyGen>().notNull().default({}),
  status: text("status").notNull().default("queued"),
  generationId: uuid("generation_id"),
  error: text("error"),
  ...timestamps,
}, t => [index("characters_brand_idx").on(t.orgId, t.brandId)]);

/**
 * Private voices a workspace made on HeyGen — instant clones from a recording and voices
 * designed from a description. The HeyGen account is shared across workspaces, so this is
 * what scopes a private voice to the brand that owns it.
 */
export const brandVoices = pgTable("brand_voices", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("heygen"),
  voiceId: text("voice_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<"clone" | "designed">().notNull(),
  gender: text("gender"),
  language: text("language"),
  /** Our copy of the preview (storage key) — HeyGen's URLs are signed and expire. */
  sampleKey: text("sample_key"),
  status: text("status").$type<"processing" | "ready" | "failed">().notNull().default("processing"),
  error: text("error"),
  /** The description a designed voice came from. */
  prompt: text("prompt"),
  ...timestamps,
}, t => [index("brand_voices_brand_idx").on(t.orgId, t.brandId), index("brand_voices_voice_idx").on(t.voiceId)]);
