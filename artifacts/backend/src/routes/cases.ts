import { Router, type Request, type Response } from "express";
import { eq, desc, or, ne, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, users, caseEvents, caseEventImages } from "../db/schema.js";
import { generateCaseNumber } from "../lib/caseNumber.js";
import { deleteS3Object } from "../lib/s3.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

const createCaseSchema = z.object({
  vehicleNumber: z.string().min(1),
  carModel: z.string().min(1),
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
  kmCount: z.string().optional(),
  dueDate: z.string().optional(),
  deliveryType: z.string().optional(),
  notes: z.string().optional(),
});

const internalStatusSchema = z.object({
  status: z.enum([
    "intake", "in_progress", "awaiting_parts", "denting", "painting",
    "polishing", "electrical", "washing", "quality_check", "ready",
    "delivered", "cancelled",
  ]),
  note: z.string().optional(),
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
  whatsappStatus: cases.whatsappStatus,
  advisorId: cases.advisorId,
  createdAt: cases.createdAt,
  updatedAt: cases.updatedAt,
};

async function findCase(caseNumber: string) {
  const [c] = await db
    .select()
    .from(cases)
    .where(eq(cases.caseNumber, caseNumber))
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

// ── GET /cases ─────────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;

  if (role === "superadmin" || role === "admin") {
    const result = await db
      .select(caseListSelect)
      .from(cases)
      .orderBy(desc(cases.createdAt));
    res.json(result);
    return;
  }

  if (role === "advisor") {
    const result = await db
      .select(caseListSelect)
      .from(cases)
      .where(eq(cases.advisorId, userId))
      .orderBy(desc(cases.createdAt));
    res.json(result);
    return;
  }

  if (role === "technician") {
    // All open cases (not delivered/cancelled)
    const result = await db
      .select(caseListSelect)
      .from(cases)
      .where(
        and(
          ne(cases.internalStatus, "delivered"),
          ne(cases.internalStatus, "cancelled")
        )
      )
      .orderBy(desc(cases.createdAt));
    res.json(result);
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

  // Fetch timeline events
  const events = await db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.caseId, c.id))
    .orderBy(caseEvents.createdAt);

  // Fetch advisor name
  const [advisor] = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, c.advisorId))
    .limit(1);

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
    if (!canAccessCase(role, c.advisorId, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const prevStatus = c.internalStatus;
    const [updated] = await db
      .update(cases)
      .set({ internalStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(cases.id, c.id))
      .returning({ internalStatus: cases.internalStatus });

    await db.insert(caseEvents).values({
      caseId: c.id,
      eventType: "internal_status_change",
      createdBy: userId,
      message: parsed.data.note ?? null,
      metadata: { from: prevStatus, to: parsed.data.status },
    });

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

// ── DELETE /cases/:caseNumber ──────────────────────────────────────────────────

router.delete(
  "/:caseNumber",
  requireRole("superadmin", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    // Collect S3 keys before cascade delete wipes DB records
    const images = await db
      .select({ s3Key: caseEventImages.s3Key })
      .from(caseEventImages)
      .where(eq(caseEventImages.caseId, c.id));

    await db.delete(cases).where(eq(cases.id, c.id));

    // Best-effort S3 cleanup — fire and forget
    void Promise.allSettled(images.map((img) => deleteS3Object(img.s3Key)));

    res.status(204).end();
  }
);

export default router;
