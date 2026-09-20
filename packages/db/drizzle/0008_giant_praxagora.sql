CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"route" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"digest" text,
	"stack" text,
	"release" text,
	"count" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_events_last_seen_idx" ON "error_events" USING btree ("last_seen_at");