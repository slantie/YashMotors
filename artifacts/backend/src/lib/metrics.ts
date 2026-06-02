import client from "prom-client";
import type { Request, Response, NextFunction } from "express";

// Single shared registry. Default Node/process metrics + custom app metrics.
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

// Queue depth (BullMQ whatsapp queue) — sampled by the worker / a periodic poll.
export const whatsappQueueDepth = new client.Gauge({
  name: "whatsapp_queue_depth",
  help: "Pending jobs in the WhatsApp queue",
  labelNames: ["state"] as const,
  registers: [registry],
});

// OCR proxy errors (upstream failures from the OCR service).
export const ocrProxyErrors = new client.Counter({
  name: "ocr_proxy_errors_total",
  help: "OCR proxy upstream errors",
  registers: [registry],
});

/**
 * Per-request timing middleware. Uses the matched route path (e.g. /cases/:caseNumber)
 * as the label so cardinality stays bounded — never the raw URL.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.baseUrl || req.path || "unknown";
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}
