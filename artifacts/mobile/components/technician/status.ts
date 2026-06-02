import type { InternalStatus } from "@/services/cases";

// Single source of truth for technician-facing status metadata. Keeping it out of the
// screen file lets the row, chips, and summary share one definition.

export const ACTIVE_STATUSES: InternalStatus[] = [
  "intake", "in_progress", "awaiting_parts", "denting", "painting",
  "polishing", "electrical", "washing", "quality_check", "ready",
];

// Sub-statuses that mean "a technician is actively working the car".
export const WORKING_STATUSES: InternalStatus[] = [
  "in_progress", "denting", "painting", "polishing",
  "electrical", "washing", "quality_check",
];

export const STATUS_COLORS: Partial<Record<InternalStatus, string>> = {
  intake:         "#6366F1",
  in_progress:    "#B54708",
  awaiting_parts: "#C05621",
  denting:        "#7C3AED",
  painting:       "#0284C7",
  polishing:      "#0891B2",
  electrical:     "#D97706",
  washing:        "#059669",
  quality_check:  "#8B5CF6",
  ready:          "#16A34A",
};

export const STATUS_LABELS: Partial<Record<InternalStatus, string>> = {
  intake:         "Intake",
  in_progress:    "In Progress",
  awaiting_parts: "Awaiting Parts",
  denting:        "Denting",
  painting:       "Painting",
  polishing:      "Polishing",
  electrical:     "Electrical",
  washing:        "Washing",
  quality_check:  "QC",
  ready:          "Ready",
};

export function statusColor(s: InternalStatus): string {
  return STATUS_COLORS[s] ?? "#8A95A6";
}

export function statusLabel(s: InternalStatus): string {
  return STATUS_LABELS[s] ?? s;
}

/** Hours a case has sat since last update. */
export function waitingHours(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60));
}

/** Compact human label for waiting time. */
export function waitingLabel(updatedAt: string): string {
  const hrs = waitingHours(updatedAt);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d`;
  if (hrs > 0) return `${hrs}h`;
  return "< 1h";
}

// A case idle longer than this is flagged as needing attention.
export const STALE_HOURS = 48;
