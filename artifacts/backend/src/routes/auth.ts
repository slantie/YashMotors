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
import { redis } from "../lib/redis.js";

const router = Router();

// ── Login rate limiting ────────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECS = 15 * 60;
const failKey = (phone: string) => `login_fail:${phone}`;

async function isLoginBlocked(phone: string): Promise<boolean> {
  const count = await redis.get(failKey(phone));
  return count !== null && parseInt(count, 10) >= MAX_LOGIN_ATTEMPTS;
}

async function recordLoginFailure(phone: string): Promise<void> {
  const key = failKey(phone);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, LOCKOUT_SECS);
}

async function clearLoginFailures(phone: string): Promise<void> {
  await redis.del(failKey(phone));
}

const loginSchema = z.object({
  phone: z.string().min(10),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

const changePinSchema = z.object({
  currentPin: z.string().length(4).regex(/^\d{4}$/),
  newPin: z.string().length(4).regex(/^\d{4}$/),
});

// POST /auth/register — public, creates advisor account
const registerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Invalid phone number"),
  pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
});

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const { name, phone, pin } = parsed.data;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Phone already registered" });
    return;
  }

  const pinHash = await hashPin(pin);
  const [user] = await db
    .insert(users)
    .values({ name, phone, pinHash, role: "advisor" })
    .returning({ id: users.id, name: users.name, phone: users.phone, role: users.role });

  res.status(201).json(user);
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Phone and 4-digit PIN required" });
    return;
  }
  const { phone, pin } = parsed.data;

  if (await isLoginBlocked(phone)) {
    res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user || !user.isActive) {
    await recordLoginFailure(phone);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.pinHash) {
    res.status(401).json({ error: "Account not set up. Contact admin." });
    return;
  }
  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) {
    await recordLoginFailure(phone);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await clearLoginFailures(phone);

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
