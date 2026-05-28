import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "./env.js";
import { db } from "./db/client.js";
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

const logger = pino({ level: "info" });

logger.info("Running database migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
logger.info("Migrations complete.");

const app = express();

app.use(helmet());
app.use(cors());

// Proxy OCR requests before any body parsers to preserve the multipart stream
app.use(
  "/ocr",
  createProxyMiddleware({
    target: env.OCR_URL,
    changeOrigin: true,
    pathRewrite: (path) => (path === "/" ? "/ocr" : path),
    logger: console,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/departments", departmentsRouter);
app.use("/cases", casesRouter);
app.use("/cases", caseEventsRouter);
app.use("/cases", imagesRouter);
app.use("/cases", whatsappRouter);
app.use("/notifications", notificationsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled error");
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { status?: number; statusCode?: number }).statusCode ??
    500;
  res.status(status).json({ error: (err as Error).message ?? "Internal server error" });
};
app.use(errorHandler);

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Backend server listening");
  startWhatsAppWorker();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
});
