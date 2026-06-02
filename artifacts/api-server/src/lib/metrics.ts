import client from "prom-client";
import type { Request, Response, NextFunction } from "express";
import { getWhatsAppState } from "./whatsapp-connection";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

// WhatsApp link health, sampled at scrape time from the connection module.
new client.Gauge({
  name: "whatsapp_connected",
  help: "1 if the WhatsApp socket is connected, else 0",
  registers: [registry],
  collect() {
    this.set(getWhatsAppState().connected ? 1 : 0);
  },
});

new client.Gauge({
  name: "whatsapp_logged_out",
  help: "1 if the WhatsApp session is logged out (needs re-link), else 0",
  registers: [registry],
  collect() {
    this.set(getWhatsAppState().loggedOut ? 1 : 0);
  },
});

new client.Gauge({
  name: "whatsapp_reconnect_attempts",
  help: "Consecutive reconnect attempts since last successful connection",
  registers: [registry],
  collect() {
    this.set(getWhatsAppState().reconnectAttempts);
  },
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.baseUrl || req.path || "unknown";
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
}
