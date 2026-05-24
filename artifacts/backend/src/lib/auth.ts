import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { env } from "../env.js";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ACCESS_TOKEN_TTL = "8h";
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface JwtPayload {
  userId: number;
  role: string;
  name: string;
  phone: string;
}

// ── PIN ────────────────────────────────────────────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// ── Access token (JWT, short-lived) ───────────────────────────────────────────

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as JwtPayload;
}

// ── Refresh token (opaque random, stored as hash) ──────────────────────────────

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}
