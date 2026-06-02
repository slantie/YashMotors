-- MEDIUM-001 — performance indexes for frequently-filtered columns + trigram search.
-- All CREATE ... IF NOT EXISTS so the migration is idempotent / safe to re-run.

-- Trigram extension powers fast `ILIKE '%q%'` (archive search) via a GIN index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Archive search scans case_number / vehicle_number / customer_name / customer_phone / car_model
-- with leading-wildcard ILIKE. A GIN trigram index over the concatenated searchable text
-- turns those sequential scans into index lookups.
CREATE INDEX IF NOT EXISTS cases_search_trgm_idx ON "cases" USING gin (
  (
    "case_number" || ' ' ||
    "vehicle_number" || ' ' ||
    coalesce("customer_name", '') || ' ' ||
    coalesce("customer_phone", '') || ' ' ||
    "car_model"
  ) gin_trgm_ops
);

-- internal_status is filtered by the archive status filter and the technician "open cases"
-- list. Partial index on live rows only (matches the always-present `deleted_at IS NULL`).
CREATE INDEX IF NOT EXISTS cases_internal_status_active_idx
  ON "cases" ("internal_status") WHERE "deleted_at" IS NULL;

-- notify-advisor cooldown query filters case_events by created_by (+ case_id, already indexed).
CREATE INDEX IF NOT EXISTS case_events_created_by_idx ON "case_events" ("created_by");

-- Notification list / unread badge filter by (user_id, read).
CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx ON "notifications" ("user_id", "read");

-- attachPrimaryImages looks up the single primary image per case. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS case_event_images_case_primary_idx
  ON "case_event_images" ("case_id") WHERE "is_primary";

-- refresh-token pruning job / expiry sweeps filter by expires_at (see LOW-001).
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON "refresh_tokens" ("expires_at");
