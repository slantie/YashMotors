import { Router, type Request, type Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, caseEvents } from "../db/schema.js";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";
import { createNotification, notifyAdmins } from "../lib/notifications.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────────────────

async function findCase(caseNumber: string) {
  const [c] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.caseNumber, caseNumber), isNull(cases.deletedAt)))
    .limit(1);
  return c ?? null;
}

function canAccessCase(role: string, advisorId: number, userId: number): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "advisor") return advisorId === userId;
  return false;
}

// ── POST /cases/:caseNumber/events ─────────────────────────────────────────────
// Adds a narrative note to the case timeline.
// technician_update: any authenticated role
// customer_update: advisor (own) / admin / superadmin only

const addEventSchema = z.object({
  eventType: z.enum(["technician_update", "customer_update"]),
  message: z.string().min(1).max(2000),
});

router.post("/:caseNumber/events", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;
  const parsed = addEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const c = await findCase(String(req.params.caseNumber));
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }

  if (role === "advisor" && c.advisorId !== userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (parsed.data.eventType === "customer_update" && role === "technician") {
    res.status(403).json({ error: "Technicians cannot post customer updates" }); return;
  }

  // Closed cases: only admin/superadmin may append
  if (
    (c.internalStatus === "delivered" || c.internalStatus === "cancelled") &&
    role !== "admin" && role !== "superadmin"
  ) {
    res.status(409).json({ error: "Case is closed" }); return;
  }

  const [event] = await db
    .insert(caseEvents)
    .values({
      caseId: c.id,
      eventType: parsed.data.eventType,
      createdBy: userId,
      message: parsed.data.message,
    })
    .returning();

  const preview = parsed.data.message.slice(0, 80) + (parsed.data.message.length > 80 ? "…" : "");

  // technician_update → notify advisor (unless they wrote it themselves)
  if (parsed.data.eventType === "technician_update" && userId !== c.advisorId) {
    void createNotification({
      userId: c.advisorId,
      caseId: c.id,
      eventId: event.id,
      title: `Update on ${c.caseNumber}`,
      body: preview,
      data: { caseNumber: c.caseNumber },
    });
  }

  // customer_update → notify all admins/superadmins + case owner if someone else posted
  if (parsed.data.eventType === "customer_update") {
    void notifyAdmins(
      {
        caseId: c.id,
        eventId: event.id,
        title: `Customer Update — ${c.caseNumber}`,
        body: preview,
        data: { caseNumber: c.caseNumber },
      },
      userId
    );
    if (userId !== c.advisorId) {
      void createNotification({
        userId: c.advisorId,
        caseId: c.id,
        eventId: event.id,
        title: `Customer Update — ${c.caseNumber}`,
        body: preview,
        data: { caseNumber: c.caseNumber },
      });
    }
  }

  res.status(201).json(event);
});

// ── PATCH /cases/:caseNumber — edit case metadata ──────────────────────────────
// Writes a case_edited timeline event recording exactly what changed.

const editCaseSchema = z.object({
  vehicleNumber: z.string().min(1).max(50).optional(),
  carModel:      z.string().min(1).max(100).optional(),
  customerPhone: z.string().regex(/^\+?\d{8,15}$/).nullable().optional(),
  customerName:  z.string().max(100).nullable().optional(),
  kmCount:       z.string().max(20).nullable().optional(),
  dueDate:       z.string().max(50).nullable().optional(),
  deliveryType:  z.string().max(50).nullable().optional(),
  notes:         z.string().max(5000).nullable().optional(),
});

const EDITABLE_FIELDS = [
  "vehicleNumber", "carModel", "customerPhone", "customerName",
  "kmCount", "dueDate", "deliveryType", "notes",
] as const;

router.patch("/:caseNumber", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;
  const parsed = editCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const c = await findCase(String(req.params.caseNumber));
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }
  if (!canAccessCase(role, c.advisorId, userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (
    (c.internalStatus === "delivered" || c.internalStatus === "cancelled") &&
    role !== "admin" && role !== "superadmin"
  ) {
    res.status(409).json({ error: "Case is closed and cannot be edited" }); return;
  }

  // Compute diff — skip fields not in the request body (undefined means untouched)
  const updates: Partial<Record<(typeof EDITABLE_FIELDS)[number], string | null>> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const field of EDITABLE_FIELDS) {
    if (!(field in parsed.data)) continue;
    const next = parsed.data[field] ?? null;
    const prev = (c[field] as string | null | undefined) ?? null;
    if (next !== prev) {
      updates[field] = next;
      diff[field] = { from: prev, to: next };
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(c); // nothing changed — return current state
    return;
  }

  const [updated] = await db
    .update(cases)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ ...(updates as any), updatedAt: new Date() })
    .where(eq(cases.id, c.id))
    .returning();

  await db.insert(caseEvents).values({
    caseId: c.id,
    eventType: "case_edited",
    createdBy: userId,
    metadata: diff,
  });

  res.json(updated);
});

export default router;
