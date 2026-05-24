import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { departments, users } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

const deptSchema = z.object({ name: z.string().min(1) });

// GET /departments — all roles
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const result = await db.select().from(departments).orderBy(departments.name);
  res.json(result);
});

// POST /departments — superadmin only
router.post(
  "/",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "name required" }); return; }
    const [dept] = await db.insert(departments).values(parsed.data).returning();
    res.status(201).json(dept);
  }
);

// PUT /departments/:id — superadmin only
router.put(
  "/:id",
  requireRole("superadmin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "name required" }); return; }
    const [dept] = await db
      .update(departments)
      .set(parsed.data)
      .where(eq(departments.id, Number(req.params.id)))
      .returning();
    if (!dept) { res.status(404).json({ error: "Department not found" }); return; }
    res.json(dept);
  }
);

export default router;
