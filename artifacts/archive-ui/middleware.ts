import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/archive/login", "/archive/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("archive_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/archive/login", req.url));

  try {
    const key = process.env.ARCHIVE_JWT_SECRET;
    if (!key) throw new Error("ARCHIVE_JWT_SECRET not set");
    await jwtVerify(token, new TextEncoder().encode(key));
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/archive/login", req.url));
    res.cookies.delete("archive_session");
    return res;
  }
}

export const config = {
  matcher: ["/archive/:path*"],
};
