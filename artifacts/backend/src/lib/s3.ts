import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "../env.js";

export const s3 = new S3Client({
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase());
}

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

export async function deleteS3Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

// Legacy helpers kept for any existing callers
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  return presignPut(key, contentType);
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  return presignGet(key);
}
