import { Router, type Request, type Response } from "express";
import { eq, desc, or, ne, and, inArray, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, users, caseEvents, notifications, caseEventImages } from "../db/schema.js";
import { generateCaseNumber } from "../lib/caseNumber.js";
import { waQueue } from "../lib/queue.js";
import { presignGet } from "../lib/s3.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

const createCaseSchema = z.object({
  vehicleNumber: z.string().min(1).max(50),
  carModel: z.string().min(1).max(100),
  customerPhone: z.string().regex(/^\+?\d{8,15}$/).optional(),
  customerName: z.string().max(100).optional(),
  kmCount: z.string().max(20).optional(),
  dueDate: z.string().max(50).optional(),
  deliveryType: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
  customerArrivalStatus: z.enum(["walk_in", "pickup", "customer_waiting", "breakdown"]).optional(),
  serviceType: z.enum(["service", "repair"]).optional(),
  serviceSubType: z.enum(["major", "minor", "breakdown", "running"]).optional(),
});

const internalStatusSchema = z.object({
  status: z.enum([
    "intake", "in_progress", "awaiting_parts", "denting", "painting",
    "polishing", "electrical", "washing", "quality_check", "ready",
    "delivered", "cancelled",
  ]),
  note: z.string().max(2000).optional(),
});

const transferSchema = z.object({
  targetAdvisorId: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

const customerStatusSchema = z.object({
  status: z.enum([
    "received", "in_repair", "final_inspection", "ready_for_delivery", "delivered",
  ]),
});

// ── helpers ────────────────────────────────────────────────────────────────────

const caseListSelect = {
  id: cases.id,
  caseNumber: cases.caseNumber,
  vehicleNumber: cases.vehicleNumber,
  carModel: cases.carModel,
  customerPhone: cases.customerPhone,
  customerName: cases.customerName,
  kmCount: cases.kmCount,
  dueDate: cases.dueDate,
  deliveryType: cases.deliveryType,
  notes: cases.notes,
  internalStatus: cases.internalStatus,
  customerStatus: cases.customerStatus,
  customerArrivalStatus: cases.customerArrivalStatus,
  serviceType: cases.serviceType,
  serviceSubType: cases.serviceSubType,
  whatsappStatus: cases.whatsappStatus,
  advisorId: cases.advisorId,
  createdAt: cases.createdAt,
  updatedAt: cases.updatedAt,
};

async function findCase(caseNumber: string) {
  const [c] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.caseNumber, caseNumber), isNull(cases.deletedAt)))
    .limit(1);
  return c ?? null;
}

function canAccessCase(
  role: string,
  advisorId: number,
  userId: number
): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "advisor") return advisorId === userId;
  return false; // technician cannot mutate cases
}

const caseListWithAdvisor = { ...caseListSelect, advisorName: users.name };

// ── primary image helper ───────────────────────────────────────────────────────

async function attachPrimaryImages<T extends { id: number }>(
  rows: T[]
): Promise<(T & { primaryImageUrl?: string })[]> {
  if (rows.length === 0) return rows;

  const primaryImgs = await db
    .select({ caseId: caseEventImages.caseId, s3Key: caseEventImages.s3Key })
    .from(caseEventImages)
    .where(and(eq(caseEventImages.isPrimary, true), inArray(caseEventImages.caseId, rows.map((r) => r.id))));

  const keyMap = new Map(primaryImgs.map((img) => [img.caseId, img.s3Key]));
  const uniqueKeys = [...new Set(keyMap.values())];

  const urlMap = new Map<string, string>();
  await Promise.all(
    uniqueKeys.map(async (key) => {
      try { urlMap.set(key, await presignGet(key)); } catch { /* skip */ }
    })
  );

  return rows.map((row) => {
    const key = keyMap.get(row.id);
    const url = key ? urlMap.get(key) : undefined;
    return url ? { ...row, primaryImageUrl: url } : row;
  });
}

// ── GET /cases ─────────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;

  if (role === "superadmin" || role === "admin") {
    const rows = await db
      .select(caseListWithAdvisor)
      .from(cases)
      .leftJoin(users, eq(cases.advisorId, users.id))
      .where(isNull(cases.deletedAt))
      .orderBy(desc(cases.createdAt));
    res.json(await attachPrimaryImages(rows));
    return;
  }

  if (role === "advisor") {
    const rows = await db
      .select(caseListWithAdvisor)
      .from(cases)
      .leftJoin(users, eq(cases.advisorId, users.id))
      .where(and(eq(cases.advisorId, userId), isNull(cases.deletedAt)))
      .orderBy(desc(cases.createdAt));
    res.json(await attachPrimaryImages(rows));
    return;
  }

  if (role === "technician") {
    const includeAll = req.query.history === "1";
    const rows = await db
      .select(caseListWithAdvisor)
      .from(cases)
      .leftJoin(users, eq(cases.advisorId, users.id))
      .where(
        includeAll
          ? isNull(cases.deletedAt)
          : and(
              isNull(cases.deletedAt),
              ne(cases.internalStatus, "delivered"),
              ne(cases.internalStatus, "cancelled")
            )
      )
      .orderBy(desc(cases.updatedAt));
    res.json(await attachPrimaryImages(rows));
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

// ── POST /cases ────────────────────────────────────────────────────────────────

router.post(
  "/",
  requireRole("superadmin", "admin", "advisor"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { userId } = (req as AuthRequest).user;
    const caseNumber = await generateCaseNumber();

    const [newCase] = await db
      .insert(cases)
      .values({ ...parsed.data, caseNumber, advisorId: userId })
      .returning();

    // Auto-create intake_created event on the timeline
    await db.insert(caseEvents).values({
      caseId: newCase.id,
      eventType: "intake_created",
      createdBy: userId,
      message: `Case ${caseNumber} created for ${newCase.vehicleNumber}`,
    });

    res.status(201).json(newCase);
  }
);

// ── GET /cases/:caseNumber ─────────────────────────────────────────────────────

router.get("/:caseNumber", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;
  const c = await findCase(String(req.params.caseNumber));
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }

  // Technician can view any open case; advisor only own
  if (role === "advisor" && c.advisorId !== userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [events, [advisor]] = await Promise.all([
    db
      .select({
        id: caseEvents.id,
        caseId: caseEvents.caseId,
        eventType: caseEvents.eventType,
        message: caseEvents.message,
        metadata: caseEvents.metadata,
        createdBy: caseEvents.createdBy,
        createdByName: users.name,
        createdAt: caseEvents.createdAt,
      })
      .from(caseEvents)
      .leftJoin(users, eq(caseEvents.createdBy, users.id))
      .where(eq(caseEvents.caseId, c.id))
      .orderBy(caseEvents.createdAt),
    db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(eq(users.id, c.advisorId)).limit(1),
  ]);

  res.json({ ...c, advisor, events });
});

// ── PUT /cases/:caseNumber/internal-status ─────────────────────────────────────

router.put(
  "/:caseNumber/internal-status",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = internalStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId) && role !== "technician") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Technicians may only set operational statuses — not terminal/intake ones
    const TECHNICIAN_ALLOWED = new Set([
      "in_progress", "awaiting_parts", "denting", "painting",
      "polishing", "electrical", "washing", "quality_check", "ready",
    ]);
    if (role === "technician" && !TECHNICIAN_ALLOWED.has(parsed.data.status)) {
      res.status(403).json({ error: "Technicians cannot set this status" }); return;
    }

    const prevStatus = c.internalStatus;
    const isDelivery = parsed.data.status === "delivered";
    const isCancellation = parsed.data.status === "cancelled";

    const [updated] = await db
      .update(cases)
      .set({
        internalStatus: parsed.data.status,
        ...(isDelivery ? { customerStatus: "delivered" } : {}),
        ...(isCancellation ? { customerStatus: "received" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cases.id, c.id))
      .returning({ internalStatus: cases.internalStatus, customerStatus: cases.customerStatus });

    const extraEvents = isDelivery
      ? [
          {
            caseId: c.id,
            eventType: "customer_status_change" as const,
            createdBy: userId,
            message: null as string | null,
            metadata: { from: c.customerStatus, to: "delivered", auto: true },
          },
          {
            caseId: c.id,
            eventType: "delivery_completed" as const,
            createdBy: userId,
            message: "Vehicle delivered to customer",
            metadata: {} as Record<string, unknown>,
          },
        ]
      : isCancellation
      ? [
          {
            caseId: c.id,
            eventType: "customer_status_change" as const,
            createdBy: userId,
            message: null as string | null,
            metadata: { from: c.customerStatus, to: "received", auto: true },
          },
        ]
      : [];

    await db.insert(caseEvents).values([
      {
        caseId: c.id,
        eventType: "internal_status_change",
        createdBy: userId,
        message: parsed.data.note ?? null,
        metadata: { from: prevStatus, to: parsed.data.status },
      },
      ...extraEvents,
    ]);

    res.json(updated);
  }
);

// ── PUT /cases/:caseNumber/customer-status ─────────────────────────────────────

router.put(
  "/:caseNumber/customer-status",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = customerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const prevStatus = c.customerStatus;
    const [updated] = await db
      .update(cases)
      .set({ customerStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(cases.id, c.id))
      .returning({ customerStatus: cases.customerStatus });

    await db.insert(caseEvents).values({
      caseId: c.id,
      eventType: "customer_status_change",
      createdBy: userId,
      message: null,
      metadata: { from: prevStatus, to: parsed.data.status },
    });

    res.json(updated);
  }
);

// ── DELETE /cases/:caseNumber — soft delete ────────────────────────────────────

router.delete(
  "/:caseNumber",
  requireRole("superadmin", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    await db
      .update(cases)
      .set({ deletedAt: new Date() })
      .where(eq(cases.id, c.id));

    // Cancel any pending/delayed WhatsApp jobs for this case so the worker
    // doesn't mutate a deleted case.
    try {
      const pending = await waQueue.getJobs(["waiting", "delayed", "active"]);
      await Promise.allSettled(
        pending.filter((j) => j.data.caseId === c.id).map((j) => j.remove())
      );
    } catch (queueErr) {
      console.warn("[delete case] Could not drain WA jobs:", queueErr);
    }

    res.status(204).end();
  }
);

// ── POST /cases/:caseNumber/notify-advisor ─────────────────────────────────────
// Technician explicitly submits completed repair work for advisor review.
// Inserts a timeline event + notification, then fires push if token exists.

router.post(
  "/:caseNumber/notify-advisor",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    if (role !== "technician") {
      res.status(403).json({ error: "Only technicians can submit for advisor review" });
      return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    // Rate-limit: one notification per technician per case per 5 minutes
    const cooldown = new Date(Date.now() - 5 * 60 * 1000);
    const [recent] = await db
      .select({ id: caseEvents.id })
      .from(caseEvents)
      .where(
        and(
          eq(caseEvents.caseId, c.id),
          eq(caseEvents.createdBy, userId),
          eq(caseEvents.eventType, "technician_update"),
          gt(caseEvents.createdAt, cooldown)
        )
      )
      .orderBy(desc(caseEvents.createdAt))
      .limit(1);
    if (recent) {
      res.status(429).json({ error: "Already notified the advisor recently. Please wait a few minutes." });
      return;
    }

    // Timeline event so advisor sees it in the case history
    const [event] = await db
      .insert(caseEvents)
      .values({
        caseId: c.id,
        eventType: "technician_update",
        createdBy: userId,
        message: "Repairs submitted for advisor review",
      })
      .returning();

    const title = "Repairs Ready for Review";
    const body = `${c.caseNumber} · ${c.vehicleNumber} — technician has submitted repair work`;

    const [notif] = await db
      .insert(notifications)
      .values({ userId: c.advisorId, caseId: c.id, eventId: event.id, title, body })
      .returning({ id: notifications.id });

    res.json({ success: true, notificationId: notif.id });

    // Fire push token lookup + send after response is flushed
    (async () => {
      try {
        const [advisor] = await db
          .select({ pushToken: users.pushToken })
          .from(users)
          .where(eq(users.id, c.advisorId))
          .limit(1);

        if (!advisor?.pushToken) return;

        const r = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify([{
            to: advisor.pushToken,
            title,
            body,
            data: { caseNumber: c.caseNumber },
            sound: "default",
          }]),
        });
        const d = await r.json().catch(() => null) as { data?: Array<{ status?: string }> } | null;
        if (d?.data?.[0]?.status === "ok") {
          await db.update(notifications).set({ pushSent: true }).where(eq(notifications.id, notif.id));
        }
      } catch (err) {
        console.error("[push] notify-advisor failed:", err);
      }
    })();
  }
);

// ── PUT /cases/:caseNumber/transfer ────────────────────────────────────────────
// Reassigns a case to a different advisor. Admin/superadmin only.
// If a WhatsApp group exists, enqueues a job to add the new advisor to it.

router.put(
  "/:caseNumber/transfer",
  requireRole("superadmin", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = (req as AuthRequest).user;
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    if (c.advisorId === parsed.data.targetAdvisorId) {
      res.status(400).json({ error: "Case is already assigned to this advisor" }); return;
    }

    const [targetAdvisor] = await db
      .select({ id: users.id, name: users.name, phone: users.phone, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, parsed.data.targetAdvisorId))
      .limit(1);

    if (!targetAdvisor) { res.status(404).json({ error: "Target advisor not found" }); return; }
    if (!targetAdvisor.isActive) { res.status(400).json({ error: "Target advisor account is inactive" }); return; }
    if (!["advisor", "admin", "superadmin"].includes(targetAdvisor.role)) {
      res.status(400).json({ error: "Target user is not an advisor or admin" }); return;
    }

    const [prevAdvisor] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, c.advisorId))
      .limit(1);

    await db.update(cases)
      .set({ advisorId: parsed.data.targetAdvisorId, updatedAt: new Date() })
      .where(eq(cases.id, c.id));

    const [event] = await db.insert(caseEvents).values({
      caseId: c.id,
      eventType: "case_transferred",
      createdBy: userId,
      message: parsed.data.note ?? null,
      metadata: {
        from: c.advisorId,
        fromName: prevAdvisor?.name ?? "Unknown",
        to: parsed.data.targetAdvisorId,
        toName: targetAdvisor.name,
      },
    }).returning();

    const title = "Case Assigned to You";
    const body = `${c.caseNumber} · ${c.vehicleNumber} transferred to you${parsed.data.note ? ` — ${parsed.data.note}` : ""}`;

    const [notif] = await db.insert(notifications)
      .values({ userId: parsed.data.targetAdvisorId, caseId: c.id, eventId: event.id, title, body })
      .returning({ id: notifications.id });

    res.json({ success: true });

    (async () => {
      try {
        const [advisor] = await db
          .select({ pushToken: users.pushToken })
          .from(users)
          .where(eq(users.id, parsed.data.targetAdvisorId))
          .limit(1);

        if (advisor?.pushToken) {
          const r = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify([{
              to: advisor.pushToken,
              title,
              body,
              data: { caseNumber: c.caseNumber },
              sound: "default",
            }]),
          });
          const d = await r.json().catch(() => null) as { data?: Array<{ status?: string }> } | null;
          if (d?.data?.[0]?.status === "ok") {
            await db.update(notifications).set({ pushSent: true }).where(eq(notifications.id, notif.id));
          }
        }

        if (c.whatsappGroupId && targetAdvisor.phone) {
          await waQueue.add(
            "add_to_group",
            {
              type: "add_to_group",
              caseId: c.id,
              caseNumber: c.caseNumber,
              groupId: c.whatsappGroupId,
              phones: [targetAdvisor.phone],
              newAdvisorName: targetAdvisor.name,
              requestedBy: userId,
            },
            { attempts: 2, backoff: { type: "fixed", delay: 10000 } }
          );
        }
      } catch (err) {
        console.error("[transfer] Post-transfer tasks failed:", err);
      }
    })();
  }
);

export default router;
