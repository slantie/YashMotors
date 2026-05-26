ALTER TYPE "public"."event_type" ADD VALUE 'message_failed' BEFORE 'delivery_completed';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" text;