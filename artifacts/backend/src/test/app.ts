// Test Express app — same routes as index.ts but without server.listen(),
// worker start, or dotenv/config (env vars are set in test/setup.ts).
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import authRouter from "../routes/auth.js";
import usersRouter from "../routes/users.js";
import casesRouter from "../routes/cases.js";
import caseEventsRouter from "../routes/caseEvents.js";
import notificationsRouter from "../routes/notifications.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/cases", casesRouter);
app.use("/cases", caseEventsRouter);
app.use("/notifications", notificationsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: (err as Error).message ?? "Internal server error" });
};
app.use(errorHandler);

export default app;
