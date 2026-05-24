import { Router, type Request, type Response } from "express";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, refreshTokens } from "../db/schema.js";
import {
  verifyPin,
  hashPin,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "../lib/auth.js";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router = Router();

const loginSchema = z.object({
  phone: z.string().min(10),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

const changePinSchema = z.object({
  currentPin: z.string().length(4).regex(/^\d{4}$/),
  newPin: z.string().length(4).regex(/^\d{4}$/),
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Phone and 4-digit PIN required" });
    return;
  }
  const { phone, pin } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.pinHash) {
    res.status(401).json({ error: "Account not set up. Contact admin." });
    return;
  }
  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
  });

  const rawRefresh = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashRefreshToken(rawRefresh),
    expiresAt: refreshTokenExpiresAt(),
  });

  res.json({
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, name: user.name, role: user.role, phone: user.phone },
  });
});

// POST /auth/refresh
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }

  const hash = hashRefreshToken(refreshToken);
  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, hash),
        eq(refreshTokens.revoked, false),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!token) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  // Rotate: revoke old, issue new
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.id, token.id));

  const rawRefresh = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashRefreshToken(rawRefresh),
    expiresAt: refreshTokenExpiresAt(),
  });

  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
  });

  res.json({ accessToken, refreshToken: rawRefresh });
});

// POST /auth/logout
router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
  }
  res.json({ success: true });
});

// PUT /auth/change-pin
router.put("/change-pin", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = changePinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "currentPin and newPin (4 digits each) required" });
    return;
  }
  const { currentPin, newPin } = parsed.data;
  const userId = (req as AuthRequest).user.userId;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.pinHash) {
    res.status(400).json({ error: "No PIN set" });
    return;
  }
  const valid = await verifyPin(currentPin, user.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Current PIN incorrect" });
    return;
  }

  await db
    .update(users)
    .set({ pinHash: await hashPin(newPin) })
    .where(eq(users.id, userId));

  res.json({ success: true });
});

export default router;
