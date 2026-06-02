import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("ap-south-1"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  WHATSAPP_API_URL: z.string().url().default("http://localhost:8080"),
  WHATSAPP_INTERNAL_SECRET: z.string().optional(),
  OCR_URL: z.string().url().default("http://ocr:8000"),
  // Comma-separated allowlist of browser origins. Empty = no cross-origin access
  // (native mobile app is unaffected; it is not subject to CORS).
  CORS_ORIGINS: z.string().default(""),
  // Observability. Sentry is a no-op when the DSN is unset (safe for local dev).
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
