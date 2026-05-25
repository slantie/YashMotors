ALTER TABLE "cases" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "case_event_images_case_id_idx" ON "case_event_images" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_events_case_id_idx" ON "case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "cases_advisor_id_idx" ON "cases" USING btree ("advisor_id");--> statement-breakpoint
CREATE INDEX "cases_deleted_at_idx" ON "cases" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");