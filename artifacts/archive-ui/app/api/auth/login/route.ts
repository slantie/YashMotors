import { NextRequest, NextResponse } from "next/server";
import { createSession, COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || password !== process.env.ARCHIVE_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/archive",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
