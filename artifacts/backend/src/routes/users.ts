import { Router, type Request, type Response } from "express";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, departments } from "../db/schema.js";
import { hashPin } from "../lib/auth.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

const createUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10).max(15),
  role: z.enum(["superadmin", "admin", "advisor", "technician"]),
  departmentId: z.number().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).default("1234"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).max(15).optional(),
  role: z.enum(["superadmin", "admin", "advisor", "technician"]).optional(),
  departmentId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /users — admin+ sees all, others forbidden
router.get(
  "/",
  requireRole("superadmin", "admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        role: users.role,
        departmentId: users.departmentId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.role, users.name);
    res.json(result);
  }
);

// GET /users/me — any authenticated user
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user.userId;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      departmentId: users.departmentId,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// POST /users — superadmin only
router.post(
  "/",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { pin, ...data } = parsed.data;
    const pinHash = await hashPin(pin);

    const [user] = await db
      .insert(users)
      .values({ ...data, pinHash })
      .returning({
        id: users.id,
        name: users.name,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });
    res.status(201).json(user);
  }
);

// PUT /users/:id — superadmin only
router.put(
  "/:id",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [updated] = await db
      .update(users)
      .set(parsed.data)
      .where(eq(users.id, id))
      .returning({ id: users.id, name: users.name, role: users.role, isActive: users.isActive });

    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  }
);

// PUT /users/:id/pin — superadmin resets any user's PIN
router.put(
  "/:id/pin",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const { pin } = req.body as { pin?: string };
    if (!pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "4-digit PIN required" });
      return;
    }
    await db
      .update(users)
      .set({ pinHash: await hashPin(pin) })
      .where(eq(users.id, id));
    res.json({ success: true });
  }
);

// DELETE /users/:id — soft deactivate, superadmin only, cannot deactivate self
router.delete(
  "/:id",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const selfId = (req as AuthRequest).user.userId;
    if (id === selfId) {
      res.status(400).json({ error: "Cannot deactivate yourself" });
      return;
    }
    await db.update(users).set({ isActive: false }).where(eq(users.id, id));
    res.json({ success: true });
  }
);

export default router;
