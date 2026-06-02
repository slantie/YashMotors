import { Router, type Request, type Response } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, caseEvents, caseEventImages } from "../db/schema.js";
import {
  makeS3Key,
  presignPut,
  presignGet,
  deleteS3Object,
  isAllowedMediaType,
  maxBytesForContentType,
  s3ObjectExists,
} from "../lib/s3.js";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────────────────

async function findCase(caseNumber: string) {
  const [c] = await db.select().from(cases).where(and(eq(cases.caseNumber, caseNumber), isNull(cases.deletedAt))).limit(1);
  return c ?? null;
}

function canAccessCase(role: string, advisorId: number, userId: number): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "advisor") return advisorId === userId;
  if (role === "technician") return true;
  return false;
}

// ── POST /cases/:caseNumber/images/presign ─────────────────────────────────────
// Returns a presigned S3 PUT URL. Client uploads directly to S3, then calls /confirm.

const presignSchema = z.object({
  filename:      z.string().min(1),
  contentType:   z.string().min(1),
  folder:        z.enum(["intake", "repairs"]).default("repairs"),
  contentLength: z.number().int().positive(),
});

router.post(
  "/:caseNumber/images/presign",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    if (!isAllowedMediaType(parsed.data.contentType)) {
      res.status(400).json({ error: "Unsupported content type. Allowed: jpeg, png, heic, heif, webp, mp4, quicktime, avi, 3gpp" });
      return;
    }

    const maxBytes = maxBytesForContentType(parsed.data.contentType);
    if (parsed.data.contentLength > maxBytes) {
      res.status(413).json({
        error: `File too large. Max ${Math.round(maxBytes / (1024 * 1024))} MB for this type.`,
      });
      return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    if (role === "technician" && parsed.data.folder === "intake") {
      res.status(403).json({ error: "Technicians can only upload to the repairs folder." }); return;
    }

    const key = makeS3Key(String(req.params.caseNumber), parsed.data.folder, parsed.data.filename);
    const uploadUrl = await presignPut(key, parsed.data.contentType);
    console.log(`[presign] key=${key} contentType=${parsed.data.contentType} userId=${userId}`);

    res.json({ key, uploadUrl, expiresIn: 300 });
  }
);

// ── POST /cases/:caseNumber/images/confirm ─────────────────────────────────────
// After client uploads to S3, confirm the batch. Creates one image_uploaded event
// with all images attached. Handles isPrimary exclusivity.

const confirmItemSchema = z.object({
  key:            z.string().min(1),
  filename:       z.string().min(1),
  folder:         z.enum(["intake", "repairs"]).default("repairs"),
  mediaType:      z.enum(["image", "video"]).default("image"),
  isPrimary:      z.boolean().default(false),
  timestampClick: z.string().datetime({ offset: true }).optional(),
  lat:            z.number().min(-90).max(90).optional(),
  lng:            z.number().min(-180).max(180).optional(),
});

const confirmSchema = z.object({
  images: z.array(confirmItemSchema).min(1).max(200).refine(
    (imgs) => imgs.filter((i) => i.isPrimary).length <= 1,
    { message: "At most one image per batch can be marked as primary" }
  ),
});

router.post(
  "/:caseNumber/images/confirm",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log(`[confirm] validation failed`, parsed.error.flatten().fieldErrors);
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { console.log(`[confirm] case not found`); res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) {
      console.log(`[confirm] forbidden role=${role} advisorId=${c.advisorId} userId=${userId}`);
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { images } = parsed.data;

    // Check technician upload restriction
    if (role === "technician" && images.some((img) => img.folder === "intake")) {
      console.log(`[confirm] technicians cannot upload to intake`);
      res.status(403).json({ error: "Technicians can only upload to the repairs folder." }); return;
    }

    // HIGH-003: never trust the client-supplied key. It must live under THIS case's
    // prefix and claimed folder, or a client could attach another case's media (IDOR /
    // cross-case contamination). makeS3Key builds `.../<caseNumber>/<folder>/<file>`.
    const caseNumber = String(req.params.caseNumber);
    const badKey = images.find(
      (img) => !img.key.includes(`/${caseNumber}/${img.folder}/`)
    );
    if (badKey) {
      console.log(`[confirm] rejected key not under case prefix: ${badKey.key}`);
      res.status(400).json({ error: "An image key does not belong to this case." });
      return;
    }

    // Verify each object actually exists in S3 — catches failed/never-uploaded keys so we
    // don't store dangling pointers in the audit timeline.
    const existence = await Promise.all(images.map((img) => s3ObjectExists(img.key)));
    const missingIdx = existence.findIndex((ok) => !ok);
    if (missingIdx !== -1) {
      console.log(`[confirm] object missing in S3: ${images[missingIdx].key}`);
      res.status(409).json({ error: "One or more uploads were not found in storage. Retry the upload." });
      return;
    }

    // Run clear+insert atomically to prevent concurrent uploads leaving multiple primaries
    const { event, inserted } = await db.transaction(async (tx) => {
      if (images.some((img) => img.isPrimary)) {
        await tx
          .update(caseEventImages)
          .set({ isPrimary: false })
          .where(eq(caseEventImages.caseId, c.id));
      }

      const [event] = await tx
        .insert(caseEvents)
        .values({
          caseId:    c.id,
          eventType: "image_uploaded",
          createdBy: userId,
          message:   `${images.length} ${images.every(i => i.mediaType === "video") ? "video" : images.some(i => i.mediaType === "video") ? "file" : "image"}${images.length > 1 ? "s" : ""} uploaded`,
          metadata:  { count: images.length, folder: images[0].folder, mediaTypes: [...new Set(images.map(i => i.mediaType))] },
        })
        .returning();

      const inserted = await tx
        .insert(caseEventImages)
        .values(
          images.map((img) => ({
            eventId:        event.id,
            caseId:         c.id,
            s3Key:          img.key,
            filename:       img.filename,
            folder:         img.folder,
            mediaType:      img.mediaType,
            isPrimary:      img.isPrimary,
            timestampClick: img.timestampClick ? new Date(img.timestampClick) : null,
            lat:            img.lat != null ? String(img.lat) : null,
            lng:            img.lng != null ? String(img.lng) : null,
            uploadedBy:     userId,
          }))
        )
        .returning();

      return { event, inserted };
    });

    console.log(`[confirm] ok eventId=${event.id} inserted=${inserted.length}`);
    res.status(201).json({ event, images: inserted });
  }
);

// ── GET /cases/:caseNumber/images ──────────────────────────────────────────────
// Lists all images for a case, grouped with 15-min presigned GET URLs.
// Query param: ?folder=intake|repairs (optional filter)

router.get(
  "/:caseNumber/images",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    // Technician can view images on any open case; advisor only own
    if (role === "advisor" && c.advisorId !== userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const rawFolder = req.query.folder;
    if (rawFolder !== undefined && rawFolder !== "intake" && rawFolder !== "repairs") {
      res.status(400).json({ error: "folder must be 'intake' or 'repairs'" }); return;
    }
    const folderFilter = rawFolder as "intake" | "repairs" | undefined;

    const rows = await db
      .select()
      .from(caseEventImages)
      .where(
        folderFilter
          ? and(eq(caseEventImages.caseId, c.id), eq(caseEventImages.folder, folderFilter))
          : eq(caseEventImages.caseId, c.id)
      )
      .orderBy(desc(caseEventImages.createdAt));

    // Generate presigned URLs in parallel (typically 10-20 images per case)
    const withUrls = await Promise.all(
      rows.map(async (img) => ({ ...img, url: await presignGet(img.s3Key) }))
    );

    res.json(withUrls);
  }
);

// ── DELETE /cases/:caseNumber/images/:imageId ──────────────────────────────────
// Deletes from S3 and DB. Logs an image_deleted audit event.
// Technicians cannot delete. If S3 delete fails, DB record is still removed
// (orphaned S3 object is recoverable; dangling DB pointer is worse).

router.delete(
  "/:caseNumber/images/:imageId",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;

    if (role === "technician") {
      res.status(403).json({ error: "Technicians cannot delete images" }); return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const imageId = Number(String(req.params.imageId));
    if (!Number.isFinite(imageId)) {
      res.status(400).json({ error: "Invalid image ID" }); return;
    }

    const [img] = await db
      .select()
      .from(caseEventImages)
      .where(and(eq(caseEventImages.id, imageId), eq(caseEventImages.caseId, c.id)))
      .limit(1);

    if (!img) { res.status(404).json({ error: "Image not found" }); return; }

    // Attempt S3 delete — non-fatal (image may have never made it to S3)
    let s3Deleted = true;
    try {
      await deleteS3Object(img.s3Key);
    } catch {
      s3Deleted = false;
    }

    await db.delete(caseEventImages).where(eq(caseEventImages.id, imageId));

    await db.insert(caseEvents).values({
      caseId:    c.id,
      eventType: "image_deleted",
      createdBy: userId,
      message:   `Deleted: ${img.filename}`,
      metadata:  { s3Key: img.s3Key, folder: img.folder, s3Deleted },
    });

    res.json({ success: true });
  }
);

export default router;
