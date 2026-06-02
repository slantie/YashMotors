import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

const COOKIE = "archive_session";
const TTL = "24h";

// The signing key is SEPARATE from the login password. The password is a credential;
// this is the HMAC key that proves a session is authentic. They must never be the same
// value — otherwise anyone who learns the password can forge sessions offline.
function signingKey(): Uint8Array {
  const key = process.env.ARCHIVE_JWT_SECRET;
  if (!key) throw new Error("ARCHIVE_JWT_SECRET not set");
  if (key.length < 32) throw new Error("ARCHIVE_JWT_SECRET must be at least 32 characters");
  return new TextEncoder().encode(key);
}

export interface ArchiveSession {
  sub: string;
  role: string;
}

export async function createSession(
  sub = "archive-admin",
  role = "superadmin"
): Promise<string> {
  return new SignJWT({ sub, role })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(signingKey());
}

export async function verifySession(token: string): Promise<ArchiveSession | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey());
    return payloadToSession(payload);
  } catch {
    return null;
  }
}

function payloadToSession(payload: JWTPayload): ArchiveSession | null {
  if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
  return { sub: payload.sub, role: payload.role };
}

export async function requireSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token || !(await verifySession(token))) {
    redirect("/login");
  }
}

export { COOKIE };
