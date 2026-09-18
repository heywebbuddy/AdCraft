import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { brands } from "./brands";

export type CharacterLook = { id: string; name: string; imageKey: string; prompt: string; model: string };

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
  status: text("status").notNull().default("queued"),
  generationId: uuid("generation_id"),
  error: text("error"),
  ...timestamps,
}, t => [index("characters_brand_idx").on(t.orgId, t.brandId)]);
