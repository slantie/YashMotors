import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

export const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function presignGet(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    { expiresIn }
  );
}

export async function getS3Stream(key: string): Promise<NodeJS.ReadableStream> {
  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
  if (!res.Body) throw new Error(`Empty body for key: ${key}`);
  // AWS SDK v3 Body implements web ReadableStream — convert to Node.js Readable
  return Readable.fromWeb(res.Body.transformToWebStream() as any);
}
