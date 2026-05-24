import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, users, caseEvents } from "../db/schema.js";
import { waQueue } from "../lib/queue.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────────────────

async function findCase(caseNumber: string) {
  const [c] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber)).limit(1);
  return c ?? null;
}

function canAccessCase(role: string, advisorId: number, userId: number): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "advisor") return advisorId === userId;
  return false;
}

// ── GET /cases/:caseNumber/whatsapp/status ─────────────────────────────────────

router.get("/:caseNumber/whatsapp/status", async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = (req as AuthRequest).user;
  const c = await findCase(String(req.params.caseNumber));
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }
  if (!canAccessCase(role, c.advisorId, userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json({
    whatsappStatus: c.whatsappStatus,
    whatsappGroupId: c.whatsappGroupId,
    whatsappInviteLink: c.whatsappInviteLink,
  });
});

// ── POST /cases/:caseNumber/whatsapp/create-group ──────────────────────────────
// Enqueues a create_group job. Idempotent: rejects if already pending/created.
// Allows retry if previously failed.

const createGroupSchema = z.object({
  advisorPhone:   z.string().min(10),
  initialMessage: z.string().max(1000).optional(),
});

router.post(
  "/:caseNumber/whatsapp/create-group",
  requireRole("superadmin", "admin", "advisor"),
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) { res.status(403).json({ error: "Forbidden" }); return; }

    // Block duplicate creation
    if (c.whatsappStatus === "created") {
      res.status(409).json({
        error: "WhatsApp group already created",
        whatsappGroupId: c.whatsappGroupId,
        whatsappInviteLink: c.whatsappInviteLink,
      });
      return;
    }
    if (c.whatsappStatus === "pending" || c.whatsappStatus === "retrying") {
      res.status(409).json({ error: `Group creation already ${c.whatsappStatus}` }); return;
    }

    // Resolve group name — vehicleNumber | carModel
    const groupName = `${c.vehicleNumber} | ${c.carModel}`;

    if (!c.customerPhone) {
      res.status(400).json({ error: "Case has no customer phone. Update case first." }); return;
    }

    // Mark pending before enqueuing so concurrent calls see the lock immediately
    await db.update(cases)
      .set({ whatsappStatus: "pending", updatedAt: new Date() })
      .where(eq(cases.id, c.id));

    const job = await waQueue.add(
      "create_group",
      {
        type: "create_group",
        caseId: c.id,
        caseNumber: c.caseNumber,
        groupName,
        customerPhone: c.customerPhone,
        advisorPhone: parsed.data.advisorPhone,
        initialMessage: parsed.data.initialMessage,
        requestedBy: userId,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 15000 }, // 15s, 30s, 60s
      }
    );

    res.status(202).json({ jobId: job.id, whatsappStatus: "pending", groupName });
  }
);

// ── POST /cases/:caseNumber/whatsapp/send-message ──────────────────────────────
// Enqueues a send_message job. Case must have an existing WhatsApp group.

const sendMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

router.post(
  "/:caseNumber/whatsapp/send-message",
  requireRole("superadmin", "admin", "advisor"),
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) { res.status(403).json({ error: "Forbidden" }); return; }

    if (c.whatsappStatus !== "created" || !c.whatsappGroupId) {
      res.status(400).json({
        error: "No WhatsApp group exists for this case. Create a group first.",
        whatsappStatus: c.whatsappStatus,
      });
      return;
    }

    const job = await waQueue.add(
      "send_message",
      {
        type: "send_message",
        caseId: c.id,
        caseNumber: c.caseNumber,
        groupId: c.whatsappGroupId,
        message: parsed.data.message,
        requestedBy: userId,
      },
      {
        attempts: 2,
        backoff: { type: "fixed", delay: 30000 }, // retry after 30s
      }
    );

    res.status(202).json({ jobId: job.id });
  }
);

export default router;
