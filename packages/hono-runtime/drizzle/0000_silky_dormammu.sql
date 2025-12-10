CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"entrypoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payments_config" jsonb,
	"wallets_config" jsonb,
	"a2a_config" jsonb,
	"ap2_config" jsonb,
	"analytics_config" jsonb,
	"identity_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_unique_idx" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agents_owner_id_idx" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "agents_created_at_idx" ON "agents" USING btree ("created_at");