import "dotenv/config";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import pino from "pino";
import { env } from "./env.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import departmentsRouter from "./routes/departments.js";
import casesRouter from "./routes/cases.js";
import caseEventsRouter from "./routes/caseEvents.js";
import imagesRouter from "./routes/images.js";
import whatsappRouter from "./routes/whatsapp.js";
import notificationsRouter from "./routes/notifications.js";
import { startWhatsAppWorker } from "./workers/whatsapp.js";

const logger = pino({ level: "info" });
const app = express();

app.use(cors());
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

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Backend server listening");
  startWhatsAppWorker();
});
