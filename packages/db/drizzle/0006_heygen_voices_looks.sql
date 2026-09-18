CREATE TABLE "brand_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"provider" text DEFAULT 'heygen' NOT NULL,
	"voice_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"gender" text,
	"language" text,
	"sample_key" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "heygen" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_voices_brand_idx" ON "brand_voices" USING btree ("org_id","brand_id");--> statement-breakpoint
CREATE INDEX "brand_voices_voice_idx" ON "brand_voices" USING btree ("voice_id");