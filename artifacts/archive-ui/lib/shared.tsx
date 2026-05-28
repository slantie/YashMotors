import { type ReactNode } from "react";
import { Camera } from "lucide-react";

export const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  denting: "Denting",
  painting: "Painting",
  polishing: "Polishing",
  electrical: "Electrical",
  washing: "Washing",
  quality_check: "Quality Check",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
  received: "Received",
  in_repair: "In Repair",
  final_inspection: "Final Inspection",
  ready_for_delivery: "Ready for Delivery",
  walk_in: "Walk-in",
  pickup: "Pickup",
  customer_waiting: "Waiting",
  breakdown: "Breakdown",
  service: "Service",
  repair: "Repair",
  major: "Major",
  minor: "Minor",
  running: "Running",
  pending: "Pending",
  created: "Created",
  failed: "Failed",
  retrying: "Retrying",
  manual_required: "Manual Required",
};

export const STATUS_COLORS: Record<string, string> = {
  intake: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  awaiting_parts: "bg-yellow-50 text-yellow-700 border-yellow-200",
  denting: "bg-purple-50 text-purple-700 border-purple-200",
  painting: "bg-indigo-50 text-indigo-700 border-indigo-200",
  polishing: "bg-cyan-50 text-cyan-700 border-cyan-200",
  electrical: "bg-amber-50 text-amber-700 border-amber-200",
  washing: "bg-sky-50 text-sky-700 border-sky-200",
  quality_check: "bg-violet-50 text-violet-700 border-violet-200",
  ready: "bg-green-50 text-green-700 border-green-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  created: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export function StatusPill({
  status,
  fallback,
}: {
  status: string;
  fallback?: string;
}) {
  const label = STATUS_LABELS[status] ?? fallback ?? status.replace(/_/g, " ");
  const cls =
    STATUS_COLORS[status] ??
    "bg-secondary text-secondary-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}
    >
      {label}
    </span>
  );
}

export function InfoCard({
  icon: Icon,
  label,
  children,
  className = "",
}: {
  icon: React.ElementType;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-border/60 p-4 lg:p-5 shadow-sm shadow-black/[0.01] h-full flex flex-col ${className}`}
    >
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex-1 flex flex-col gap-1.5 justify-start">
        {children}
      </div>
    </div>
  );
}

export function EmptyMediaState({ type }: { type: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-secondary/30 rounded-lg border border-dashed border-border/80 m-2 sm:m-6">
      <div className="w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center mb-4 border border-border/50">
        <Camera className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1">
        No {type} images
      </h3>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
        Media captured during the {type} phase will automatically appear here.
      </p>
    </div>
  );
}
