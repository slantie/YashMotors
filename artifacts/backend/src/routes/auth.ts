import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
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
import { presignPut, presignGet, isAllowedImageType } from "../lib/s3.js";

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
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again in an hour." },
});

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Invalid phone number"),
  pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
});

router.post("/register", registerLimiter, async (req: Request, res: Response): Promise<void> => {
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
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({ name, phone, pinHash, role: "advisor" })
      .returning({ id: users.id, name: users.name, phone: users.phone, role: users.role });
  } catch (err: unknown) {
    // Postgres unique_violation (23505) — concurrent registration with same phone
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      res.status(409).json({ error: "Phone already registered" });
      return;
    }
    throw err;
  }

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

  // Use a transaction with SELECT FOR UPDATE to prevent concurrent refresh calls
  // from both succeeding with the same token (rotation race condition).
  const rotated = await db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hash),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1)
      .for("update");

    if (!token) return null;

    const [user] = await tx.select().from(users).where(eq(users.id, token.userId)).limit(1);
    if (!user || !user.isActive) return null;

    await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, token.id));

    const rawRefresh = generateRefreshToken();
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(rawRefresh),
      expiresAt: refreshTokenExpiresAt(),
    });

    return { user, rawRefresh };
  });

  if (!rotated) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const { user, rawRefresh } = rotated;

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

// GET /auth/me
router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user.userId;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let avatarUrl: string | null = null;
  if (user.avatarKey) {
    try { avatarUrl = await presignGet(user.avatarKey); } catch { /* non-fatal */ }
  }

  res.json({ id: user.id, name: user.name, role: user.role, phone: user.phone, avatarUrl });
});

// POST /auth/avatar/presign — returns a presigned S3 PUT URL
router.post("/avatar/presign", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user.userId;
  const { contentType = "image/jpeg" } = req.body as { contentType?: string };

  if (!isAllowedImageType(contentType)) {
    res.status(400).json({ error: "Unsupported content type. Allowed: jpeg, png, heic, heif, webp" });
    return;
  }

  const rawExt = contentType.split("/")[1] ?? "jpg";
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const key = `user-avatars/user_id_${userId}.${ext}`;
  const uploadUrl = await presignPut(key, contentType);

  res.json({ key, uploadUrl, expiresIn: 300 });
});

// POST /auth/avatar/confirm — saves key to user record, returns presigned GET URL
router.post("/avatar/confirm", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user.userId;
  const { key } = req.body as { key?: string };

  if (!key || !key.startsWith("user-avatars/")) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }

  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));
  const avatarUrl = await presignGet(key);

  res.json({ avatarUrl });
});

// DELETE /auth/avatar — removes avatar
router.delete("/avatar", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user.userId;
  await db.update(users).set({ avatarKey: null }).where(eq(users.id, userId));
  res.json({ success: true });
});

export default router;
