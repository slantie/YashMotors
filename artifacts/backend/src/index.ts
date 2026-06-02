import "dotenv/config";
import "./lib/sentry.js"; // must be imported before anything else for instrumentation
import { randomUUID } from "crypto";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { Sentry } from "./lib/sentry.js";
import { registry, metricsMiddleware, ocrProxyErrors, whatsappQueueDepth } from "./lib/metrics.js";
import { waQueue } from "./lib/queue.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import departmentsRouter from "./routes/departments.js";
import casesRouter from "./routes/cases.js";
import caseEventsRouter from "./routes/caseEvents.js";
import imagesRouter from "./routes/images.js";
import whatsappRouter from "./routes/whatsapp.js";
import notificationsRouter from "./routes/notifications.js";
import { startWhatsAppWorker } from "./workers/whatsapp.js";
import { redis } from "./lib/redis.js";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requireAuth } from "./middleware/requireAuth.js";

// Migrations run as an explicit deploy step (`pnpm migrate`), NOT on boot. The server
// starts side-effect-free so a migration issue can never crash-loop the API.

const app = express();

app.use(helmet());

// CORS allowlist driven by env. Native mobile clients are not subject to CORS, so the
// default (empty allowlist => same-origin only) costs nothing. Never pair an open origin
// with credentials.
const allowedOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Proxy OCR requests before any body parsers to preserve the multipart stream.
// requireAuth only reads the Authorization header (never the body), so it is safe to
// run ahead of the proxy and does not consume the multipart stream.
app.use(
  "/ocr",
  requireAuth,
  createProxyMiddleware({
    target: env.OCR_URL,
    changeOrigin: true,
    pathRewrite: (path) => (path === "/" ? "/ocr" : path),
    on: {
      error: (err, _req, res) => {
        ocrProxyErrors.inc();
        logger.error({ err }, "OCR proxy error");
        if ("writeHead" in res && !res.headersSent) {
          (res as import("http").ServerResponse).writeHead(502, {
            "Content-Type": "application/json",
          });
          (res as import("http").ServerResponse).end(
            JSON.stringify({ error: "OCR service unavailable" })
          );
        }
      },
    },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(
  pinoHttp({
    logger,
    // Reuse an inbound x-request-id (propagated from upstream/mobile) or mint one, so a
    // single intake can be traced backend -> WA -> OCR.
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
  })
);
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

// Prometheus scrape endpoint.
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/departments", departmentsRouter);
app.use("/cases", casesRouter);
app.use("/cases", caseEventsRouter);
app.use("/cases", imagesRouter);
app.use("/cases", whatsappRouter);
app.use("/notifications", notificationsRouter);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  (req.log ?? logger).error({ err }, "Unhandled error");
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { status?: number; statusCode?: number }).statusCode ??
    500;
  if (status >= 500) Sentry.captureException(err);
  // Never leak internal 5xx details to clients in production (MEDIUM-005). 4xx messages
  // are client-actionable and kept.
  const message =
    status < 500
      ? (err as Error).message
      : env.NODE_ENV === "production"
        ? "Internal server error"
        : ((err as Error).message ?? "Internal server error");
  res.status(status).json({ error: message });
};
app.use(errorHandler);

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  Sentry.captureException(reason);
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Backend server listening");
  startWhatsAppWorker();
  // Sample WhatsApp queue depth into Prometheus every 15s.
  setInterval(async () => {
    try {
      const counts = await waQueue.getJobCounts("waiting", "active", "failed", "delayed");
      for (const [state, n] of Object.entries(counts)) {
        whatsappQueueDepth.set({ state }, n as number);
      }
    } catch (err) {
      logger.warn({ err }, "Failed to sample queue depth");
    }
  }, 15000).unref();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
});
