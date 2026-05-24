import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cases, caseEvents, caseEventImages } from "../db/schema.js";
import {
  makeS3Key,
  presignPut,
  presignGet,
  deleteS3Object,
  isAllowedImageType,
} from "../lib/s3.js";
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────────────────

async function findCase(caseNumber: string) {
  const [c] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber)).limit(1);
  return c ?? null;
}

function canAccessCase(role: string, advisorId: number, userId: number): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "advisor") return advisorId === userId;
  return false;
}

// ── POST /cases/:caseNumber/images/presign ─────────────────────────────────────
// Returns a presigned S3 PUT URL. Client uploads directly to S3, then calls /confirm.

const presignSchema = z.object({
  filename:    z.string().min(1),
  contentType: z.string().min(1),
  folder:      z.enum(["intake", "repairs"]).default("repairs"),
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

    if (!isAllowedImageType(parsed.data.contentType)) {
      res.status(400).json({ error: "Unsupported content type. Allowed: jpeg, png, heic, heif, webp" });
      return;
    }

    const c = await findCase(String(req.params.caseNumber));
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    if (!canAccessCase(role, c.advisorId, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
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
  isPrimary:      z.boolean().default(false),
  timestampClick: z.string().datetime({ offset: true }).optional(),
  lat:            z.number().min(-90).max(90).optional(),
  lng:            z.number().min(-180).max(180).optional(),
});

const confirmSchema = z.object({
  images: z.array(confirmItemSchema).min(1).max(20),
});

router.post(
  "/:caseNumber/images/confirm",
  async (req: Request, res: Response): Promise<void> => {
    const { role, userId } = (req as AuthRequest).user;
    console.log(`[confirm] caseNumber=${req.params.caseNumber} userId=${userId} body=`, JSON.stringify(req.body));
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

    // isPrimary is exclusive per case — unmark old primary if a new one is being set
    if (images.some((img) => img.isPrimary)) {
      await db
        .update(caseEventImages)
        .set({ isPrimary: false })
        .where(eq(caseEventImages.caseId, c.id));
    }

    // One event for the entire upload batch
    const [event] = await db
      .insert(caseEvents)
      .values({
        caseId:    c.id,
        eventType: "image_uploaded",
        createdBy: userId,
        message:   `${images.length} image${images.length > 1 ? "s" : ""} uploaded`,
        metadata:  { count: images.length, folder: images[0].folder },
      })
      .returning();

    const inserted = await db
      .insert(caseEventImages)
      .values(
        images.map((img) => ({
          eventId:        event.id,
          caseId:         c.id,
          s3Key:          img.key,
          filename:       img.filename,
          folder:         img.folder,
          isPrimary:      img.isPrimary,
          timestampClick: img.timestampClick ? new Date(img.timestampClick) : null,
          lat:            img.lat != null ? String(img.lat) : null,
          lng:            img.lng != null ? String(img.lng) : null,
          uploadedBy:     userId,
        }))
      )
      .returning();

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

    const folderFilter = req.query.folder as string | undefined;

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
