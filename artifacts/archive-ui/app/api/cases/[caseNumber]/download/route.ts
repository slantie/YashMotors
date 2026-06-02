import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { cases, caseEvents, caseEventImages, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getS3Stream } from "@/lib/s3";
import archiver from "archiver";
import { PassThrough } from "stream";
import { Readable } from "stream";

async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get("archive_session")?.value;
  if (!token) return false;
  try {
    const key = process.env.ARCHIVE_JWT_SECRET;
    if (!key) return false;
    await jwtVerify(token, new TextEncoder().encode(key));
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ caseNumber: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { caseNumber } = await params;

  const [c] = await db
    .select()
    .from(cases)
    .where(eq(cases.caseNumber, caseNumber))
    .limit(1);

  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const [advisor] = await db
    .select({ name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, c.advisorId))
    .limit(1);

  const events = await db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.caseId, c.id))
    .orderBy(caseEvents.createdAt);

  const images = await db
    .select()
    .from(caseEventImages)
    .where(eq(caseEventImages.caseId, c.id))
    .orderBy(caseEventImages.createdAt);

  const manifest = {
    exportedAt: new Date().toISOString(),
    case: c,
    advisor,
    events,
    images: images.map(({ s3Key: _, ...rest }) => rest),
  };

  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  archive.append(Buffer.from(JSON.stringify(manifest, null, 2)), {
    name: "manifest.json",
  });

  for (const img of images) {
    try {
      const stream = await getS3Stream(img.s3Key);
      archive.append(stream as any, {
        name: `${img.folder}/${img.filename}`,
      });
    } catch {
      // Skip objects that failed to fetch (e.g. orphaned keys)
    }
  }

  archive.finalize();

  const webStream = Readable.toWeb(passthrough) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${caseNumber}.zip"`,
      "Transfer-Encoding": "chunked",
    },
  });
}
