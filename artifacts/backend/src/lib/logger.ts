import pino from "pino";
import { env } from "../env.js";

// Shared structured logger. Redacts auth headers and customer PII so request-body logs
// never leak names/phones (MEDIUM-008). Use `req.log` (request-scoped child with the
// request id) inside handlers instead of `console.*`.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.customerName",
      "*.contactNumber",
      "*.phone",
      "*.pin",
      "req.body.customerName",
      "req.body.contactNumber",
      "req.body.phone",
      "req.body.pin",
    ],
    remove: true,
  },
});
