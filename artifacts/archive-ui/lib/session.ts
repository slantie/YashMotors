import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "archive_session";
const TTL = "24h";

function secret() {
  const pw = process.env.ARCHIVE_PASSWORD;
  if (!pw) throw new Error("ARCHIVE_PASSWORD not set");
  return new TextEncoder().encode(pw);
}

export async function createSession(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export async function requireSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token || !(await verifySession(token))) {
    redirect("/login");
  }
}

export { COOKIE };
