CREATE TABLE "studio_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"tagline" varchar(128),
	"address" varchar(255),
	"qq" varchar(32) NOT NULL,
	"phone" varchar(32),
	"about" text,
	"business_hours" jsonb NOT NULL,
	"is_studio_open" boolean DEFAULT true NOT NULL,
	"resume_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_settings_singleton" CHECK ("studio_settings"."id" = 1)
);
