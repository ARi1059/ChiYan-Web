ALTER TABLE "models" ADD COLUMN "age" smallint;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "qq" varchar(32);--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "district" varchar(32);--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "qq_group" varchar(32);--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "home_notice" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "notice_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "display_config" jsonb DEFAULT '{"showBust":true,"showAge":true,"showDistrict":true,"showStyles":true,"showDescription":true,"showQQNumber":false}'::jsonb NOT NULL;