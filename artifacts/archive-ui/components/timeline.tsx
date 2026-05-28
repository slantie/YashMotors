import { format } from "date-fns";
import {
  Car,
  Camera,
  Trash2,
  MessageCircle,
  Users,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  Settings,
  Wrench,
  Star,
  Send,
  Ban,
} from "lucide-react";

const EVENT_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    bg: string;
    color: string;
    border: string;
  }
> = {
  intake_created: {
    icon: Car,
    label: "Case created",
    bg: "bg-blue-50",
    color: "text-blue-600",
    border: "border-blue-200",
  },
  case_edited: {
    icon: Settings,
    label: "Case edited",
    bg: "bg-amber-50",
    color: "text-amber-700",
    border: "border-amber-200",
  },
  technician_update: {
    icon: Wrench,
    label: "Technician update",
    bg: "bg-orange-50",
    color: "text-orange-600",
    border: "border-orange-200",
  },
  customer_update: {
    icon: MessageCircle,
    label: "Customer update",
    bg: "bg-green-50",
    color: "text-green-700",
    border: "border-green-200",
  },
  internal_status_change: {
    icon: ArrowRightLeft,
    label: "Status changed",
    bg: "bg-purple-50",
    color: "text-purple-600",
    border: "border-purple-200",
  },
  customer_status_change: {
    icon: ArrowRightLeft,
    label: "Customer status",
    bg: "bg-violet-50",
    color: "text-violet-600",
    border: "border-violet-200",
  },
  image_uploaded: {
    icon: Camera,
    label: "Media uploaded",
    bg: "bg-cyan-50",
    color: "text-cyan-700",
    border: "border-cyan-200",
  },
  image_deleted: {
    icon: Trash2,
    label: "Media deleted",
    bg: "bg-red-50",
    color: "text-red-600",
    border: "border-red-200",
  },
  group_created: {
    icon: Users,
    label: "Group created",
    bg: "bg-green-50",
    color: "text-green-700",
    border: "border-green-200",
  },
  group_failed: {
    icon: AlertCircle,
    label: "Group failed",
    bg: "bg-red-50",
    color: "text-red-600",
    border: "border-red-200",
  },
  message_sent: {
    icon: Send,
    label: "Message sent",
    bg: "bg-emerald-50",
    color: "text-emerald-700",
    border: "border-emerald-200",
  },
  message_failed: {
    icon: Ban,
    label: "Message failed",
    bg: "bg-red-50",
    color: "text-red-500",
    border: "border-red-200",
  },
  delivery_completed: {
    icon: CheckCircle2,
    label: "Delivered",
    bg: "bg-emerald-50",
    color: "text-emerald-700",
    border: "border-emerald-200",
  },
  case_transferred: {
    icon: ArrowRightLeft,
    label: "Case transferred",
    bg: "bg-indigo-50",
    color: "text-indigo-600",
    border: "border-indigo-200",
  },
};

const META_LABELS: Record<string, string> = {
  count: "Files",
  folder: "Folder",
  from: "From",
  to: "To",
  messageSent: "Message",
  previousAdvisor: "From advisor",
  newAdvisor: "To advisor",
  type: "Type",
};

const META_HIDE = new Set([
  "inviteLink",
  "groupId",
  "jid",
  "whatsappGroupId",
]);

type EventRow = {
  event: {
    id: number;
    eventType: string;
    message: string | null;
    metadata: unknown;
    createdAt: Date;
    sentToCustomer: boolean;
  };
  creatorName: string | null;
};

export function Timeline({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
        <Star className="h-8 w-8 opacity-20" />
        <p className="text-sm">No events recorded for this case.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-0">
        {events.map(({ event, creatorName }, index) => {
          const cfg = EVENT_CONFIG[event.eventType] ?? {
            icon: Star,
            label: event.eventType.replace(/_/g, " "),
            bg: "bg-slate-50",
            color: "text-slate-600",
            border: "border-slate-200",
          };
          const Icon = cfg.icon;
          const meta = event.metadata as Record<string, unknown> | null;
          const visibleMeta = meta
            ? Object.entries(meta).filter(([k]) => !META_HIDE.has(k))
            : [];
          const isLast = index === events.length - 1;

          return (
            <div
              key={event.id}
              className={`relative flex gap-4 ${isLast ? "" : "pb-8"}`}
            >
              {/* Icon */}
              <div
                className={`relative z-10 flex-none w-10 h-10 rounded-full border ${cfg.border} ${cfg.bg} flex items-center justify-center shadow-sm`}
              >
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1">
                  <span className="font-semibold text-sm text-foreground">
                    {cfg.label}
                  </span>
                  {creatorName && (
                    <span className="text-xs text-muted-foreground">
                      by {creatorName}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(event.createdAt), "dd MMM yyyy, HH:mm")}
                  </span>
                  {event.sentToCustomer && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold">
                      <CheckCircle2 className="h-3 w-3" />
                      Customer notified
                    </span>
                  )}
                </div>

                {event.message && (
                  <p className="text-sm text-foreground/80 leading-relaxed mb-2">
                    {event.message}
                  </p>
                )}

                {visibleMeta.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {visibleMeta.map(([k, v]) => {
                      if (k === "messageSent" && v === true) {
                        return (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-700 text-[11px] font-medium"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Message sent
                          </span>
                        );
                      }
                      const label =
                        META_LABELS[k] ??
                        k.replace(/([A-Z])/g, " $1").toLowerCase();
                      return (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary border border-border/60 text-[11px] text-foreground/80"
                        >
                          <span className="text-muted-foreground">
                            {label}:
                          </span>
                          <span className="font-medium">{String(v)}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
