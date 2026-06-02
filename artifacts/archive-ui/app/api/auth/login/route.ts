import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createSession, COOKIE } from "@/lib/session";

// In-memory IP rate limit: 5 attempts / 15 min. Single-instance archive portal, so this
// is adequate; move to a shared store if the portal is ever horizontally scaled.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (attempts.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (hits.length >= MAX_ATTEMPTS) {
    attempts.set(ip, hits);
    return true;
  }
  hits.push(now);
  attempts.set(ip, hits);
  return false;
}

// Constant-time compare. Hash both sides to a fixed length first so timingSafeEqual
// never throws on length mismatch and the comparison leaks no length information.
function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const expected = process.env.ARCHIVE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { password } = await req.json();

  if (typeof password !== "string" || !passwordMatches(password, expected)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    // Secure by default; only relaxed when explicitly in local dev (http://localhost).
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/archive",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
