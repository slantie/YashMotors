// Plain module (NOT "use server") — safe to export constants for both server actions and
// client/server components. The status filter targets cases.internal_status, so only these
// enum values are valid; filtering by a value from another enum throws in Postgres.
export const INTERNAL_STATUSES = [
  "intake", "in_progress", "awaiting_parts", "denting", "painting",
  "polishing", "electrical", "washing", "quality_check", "ready",
  "delivered", "cancelled",
] as const;

export type InternalStatus = (typeof INTERNAL_STATUSES)[number];

export const isInternalStatus = (s: string): s is InternalStatus =>
  (INTERNAL_STATUSES as readonly string[]).includes(s);
