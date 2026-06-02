import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "../env.js";
import { redis } from "./redis.js";

export const s3 = new S3Client({
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/3gpp",
]);

export function isAllowedMediaType(contentType: string): boolean {
  return ALLOWED_MEDIA_TYPES.has(contentType.toLowerCase());
}

/** Max upload sizes enforced server-side at presign time (defense against cost/abuse). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

export function maxBytesForContentType(contentType: string): number {
  return contentType.toLowerCase().startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
}

/** @deprecated use isAllowedMediaType */
export const isAllowedImageType = isAllowedMediaType;

/** year/month/day/caseNumber/folder/filename */
export function makeS3Key(caseNumber: string, folder: string, filename: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dotIdx = filename.lastIndexOf(".");
  const stem = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase() : "jpg";
  return `${year}/${month}/${day}/${caseNumber}/${folder}/${stem}.${ext}`;
}

/** Presigned PUT for client-side direct upload (5 min). */
export async function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );
}

/** Presigned GET for client display (15 min). */
export async function presignGet(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: 900 }
  );
}

// Presigned GET URLs are valid 15 min; cache them in Redis for 10 min so the
// remaining lifetime is always ≥5 min. This collapses the per-row HMAC signing
// in list endpoints (MEDIUM-002) into a single sign per key per 10 min window.
const PRESIGN_CACHE_TTL = 600; // seconds
const presignCacheKey = (key: string) => `presign:get:${key}`;

/** Cached presigned GET — falls back to a fresh signing if Redis is unavailable. */
export async function presignGetCached(key: string): Promise<string> {
  try {
    const hit = await redis.get(presignCacheKey(key));
    if (hit) return hit;
  } catch { /* redis down — sign fresh below */ }

  const url = await presignGet(key);

  try {
    await redis.set(presignCacheKey(key), url, "EX", PRESIGN_CACHE_TTL);
  } catch { /* non-fatal: caching is best-effort */ }

  return url;
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/** Returns true if an object exists at the key (used to verify a client-claimed upload). */
export async function s3ObjectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Legacy helpers kept for any existing callers
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  return presignPut(key, contentType);
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  return presignGet(key);
}
