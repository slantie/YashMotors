import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getWhatsAppState } from "../lib/whatsapp-connection";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  // Expose WhatsApp link state so uptime checks can alert on a logged-out / disconnected
  // business number (HIGH-001 / reliability).
  res.json({ ...data, whatsapp: getWhatsAppState() });
});

export default router;
