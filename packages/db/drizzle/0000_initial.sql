CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'admin', 'operator');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('available', 'booked', 'tentative');--> statement-breakpoint
CREATE TABLE "admin_password_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" bigint NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "admin_role" NOT NULL,
	"totp_secret_enc" "bytea",
	"totp_enrolled" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" bigint,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(32),
	"target_id" bigint,
	"payload" jsonb,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" varchar(128) NOT NULL,
	"admin_id" bigint NOT NULL,
	"method" varchar(8) NOT NULL,
	"path" varchar(512) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"model_id" bigint,
	"type" "media_type" NOT NULL,
	"url" text NOT NULL,
	"original_url" text NOT NULL,
	"thumb_url" text,
	"width" integer,
	"height" integer,
	"file_size" integer,
	"hash" varchar(64) NOT NULL,
	"has_watermark" boolean DEFAULT false NOT NULL,
	"uploaded_by" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"real_name_enc" "bytea",
	"height_cm" smallint,
	"weight_kg" smallint,
	"bust" smallint,
	"waist" smallint,
	"hip" smallint,
	"shoe_size_eu" smallint,
	"age_range" varchar(16),
	"hometown" varchar(32),
	"city" varchar(32),
	"style_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"can_remote" boolean DEFAULT false NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"cover_asset_id" bigint,
	"gallery_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"portfolio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooperation_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "model_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"model_id" bigint,
	"path" text NOT NULL,
	"referrer" text,
	"ip_hash" varchar(64),
	"ua" text,
	"country" varchar(8),
	"city" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_rosters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"model_id" bigint NOT NULL,
	"date" date NOT NULL,
	"status" "schedule_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_password_history" ADD CONSTRAINT "admin_password_history_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_admins_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_visits" ADD CONSTRAINT "public_visits_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_rosters" ADD CONSTRAINT "daily_rosters_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_password_history_admin_created_idx" ON "admin_password_history" USING btree ("admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "admins_username_uniq" ON "admins" USING btree ("username");--> statement-breakpoint
CREATE INDEX "admins_status_idx" ON "admins" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_admin_created_idx" ON "audit_logs" USING btree ("admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_admin_key_uniq" ON "idempotency_keys" USING btree ("admin_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_hash_uniq" ON "media_assets" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "media_assets_model_idx" ON "media_assets" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_by_idx" ON "media_assets" USING btree ("uploaded_by");--> statement-breakpoint
CREATE UNIQUE INDEX "models_code_uniq" ON "models" USING btree ("code");--> statement-breakpoint
CREATE INDEX "models_status_idx" ON "models" USING btree ("status");--> statement-breakpoint
CREATE INDEX "models_city_idx" ON "models" USING btree ("city");--> statement-breakpoint
CREATE INDEX "models_style_tags_gin_idx" ON "models" USING gin ("style_tags");--> statement-breakpoint
CREATE INDEX "models_available_types_gin_idx" ON "models" USING gin ("available_types");--> statement-breakpoint
CREATE INDEX "models_nickname_trgm_idx" ON "models" USING gin ("nickname" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "public_visits_created_idx" ON "public_visits" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "public_visits_model_created_idx" ON "public_visits" USING btree ("model_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_rosters_date_uniq" ON "daily_rosters" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_rosters_model_ids_gin_idx" ON "daily_rosters" USING gin ("model_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_entries_model_date_uniq" ON "schedule_entries" USING btree ("model_id","date");--> statement-breakpoint
CREATE INDEX "schedule_entries_date_idx" ON "schedule_entries" USING btree ("date");