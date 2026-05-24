import { Router, type Request, type Response } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { notifications, users } from "../db/schema.js";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// ── PUT /notifications/push-token ──────────────────────────────────────────────
// Register (or clear) Expo push token for the authenticated user.

const pushTokenSchema = z.object({
  token: z.string().min(1).nullable(),
});

router.put("/push-token", async (req: Request, res: Response): Promise<void> => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "token required (string or null to unregister)" });
    return;
  }
  const { userId } = (req as AuthRequest).user;
  await db
    .update(users)
    .set({ pushToken: parsed.data.token })
    .where(eq(users.id, userId));

  res.json({ success: true });
});

// ── GET /notifications/unread-count ───────────────────────────────────────────
// Fast badge count — before /:id routes to avoid route conflict.

router.get("/unread-count", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).user;
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
  res.json({ count: row?.count ?? 0 });
});

// ── GET /notifications ─────────────────────────────────────────────────────────
// Returns paginated notifications for the current user.
// ?unreadOnly=true  ?limit=50  ?offset=0

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).user;
  const unreadOnly = req.query.unreadOnly === "true";
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const condition = unreadOnly
    ? and(eq(notifications.userId, userId), eq(notifications.read, false))
    : eq(notifications.userId, userId);

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(condition)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(notifications).where(condition),
  ]);

  res.json({
    notifications: rows,
    total: countRow?.count ?? 0,
    unreadCount: unreadOnly
      ? (countRow?.count ?? 0)
      : await db
          .select({ count: count() })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
          .then(([r]) => r?.count ?? 0),
  });
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────
// Mark every unread notification as read for the current user.
// Must be BEFORE /:id routes (otherwise "read" becomes an :id value).

router.put("/read-all", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).user;
  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    )
    .returning({ id: notifications.id });

  res.json({ updated: result.length });
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────

router.put("/:id/read", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).user;
  const id = Number(String(req.params.id));
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (!updated) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ success: true });
});

// ── DELETE /notifications/:id ─────────────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthRequest).user;
  const id = Number(String(req.params.id));
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (!deleted) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ success: true });
});

export default router;
