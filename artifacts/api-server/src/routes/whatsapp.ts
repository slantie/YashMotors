import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getSocket,
  isWhatsAppConnected,
  toJid,
} from "../lib/whatsapp-connection";

const ADMIN_NUMBER = "8758800101";

const router = Router();

// ── Internal secret guard ──────────────────────────────────────────────────────
// All routes on this router require x-internal-secret header when configured.
// Set INTERNAL_SECRET env var on both this service and the backend caller.

function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_SECRET;
  if (secret && req.headers["x-internal-secret"] !== secret) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireInternalSecret);

// ── In-memory rate limiter: max 10 group creates per 5 minutes ─────────────────

const groupCreateLog: number[] = [];
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 10;

function checkGroupCreateRate(): boolean {
  const now = Date.now();
  while (groupCreateLog.length > 0 && groupCreateLog[0] < now - RATE_WINDOW_MS) {
    groupCreateLog.shift();
  }
  if (groupCreateLog.length >= RATE_MAX) return false;
  groupCreateLog.push(now);
  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

/** Composing duration based on message length — ~35ms/char, 2–8s range, ±25% jitter. */
function typingDuration(message: string): number {
  const base = Math.min(Math.max(message.length * 35, 2000), 8000);
  return base * (0.75 + Math.random() * 0.5);
}

/** Fetch invite code with 3 retries before giving up. */
async function fetchInviteLink(sock: ReturnType<typeof getSocket>, groupId: string): Promise<string> {
  const retryDelays = [1000, 3000, 5000];
  for (let i = 0; i < retryDelays.length; i++) {
    try {
      const code = await sock.groupInviteCode(groupId);
      return `https://chat.whatsapp.com/${code}`;
    } catch (err) {
      console.error(`[WhatsApp] groupInviteCode attempt ${i + 1} failed:`, (err as Error).message);
      if (i < retryDelays.length - 1) await sleep(retryDelays[i]);
    }
  }
  return "";
}

/** Simulate human typing then send message, with retries on E2E key failure. */
async function sendWithTyping(
  sock: ReturnType<typeof getSocket>,
  groupId: string,
  message: string,
  retryDelays: number[]
): Promise<{ sent: boolean; error?: string }> {
  // Presence subscription + typing simulation
  try {
    await sock.presenceSubscribe(groupId);
    await sleep(jitter(300, 700));
    await sock.sendPresenceUpdate("composing", groupId);
    await sleep(typingDuration(message));
  } catch { /* non-fatal — presence is best-effort */ }

  let lastError: string | undefined;
  for (let i = 0; i < retryDelays.length; i++) {
    if (retryDelays[i] > 0) await sleep(retryDelays[i]);
    try {
      await sock.sendMessage(groupId, { text: message });
      // Mark available after sending — mirrors human read receipt behaviour
      try {
        await sleep(jitter(200, 600));
        await sock.sendPresenceUpdate("available", groupId);
      } catch { /* non-fatal */ }
      return { sent: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Send failed";
      console.error(`[WhatsApp] sendMessage attempt ${i + 1} failed:`, lastError);
    }
  }
  return { sent: false, error: lastError };
}

// ── GET /api/whatsapp/status ───────────────────────────────────────────────────

router.get("/whatsapp/status", (_req: Request, res: Response) => {
  res.json({ connected: isWhatsAppConnected() });
});

// ── POST /api/whatsapp/create-group ───────────────────────────────────────────

router.post("/whatsapp/create-group", async (req: Request, res: Response) => {
  const { groupName, customerPhone, advisorPhone, initialMessage } = req.body as {
    groupName?: string;
    customerPhone?: string;
    advisorPhone?: string;
    initialMessage?: string;
  };

  if (!groupName || !customerPhone || !advisorPhone) {
    res.status(400).json({ success: false, error: "groupName, customerPhone and advisorPhone are required" });
    return;
  }

  if (!isWhatsAppConnected()) {
    res.status(503).json({
      success: false,
      error: "WhatsApp not connected. Scan the QR code in the server terminal and retry.",
    });
    return;
  }

  if (!checkGroupCreateRate()) {
    res.status(429).json({ success: false, error: "Group creation rate limit exceeded. Retry in a few minutes." });
    return;
  }

  let sock;
  try {
    sock = getSocket();
  } catch (err) {
    res.status(503).json({ success: false, error: err instanceof Error ? err.message : "Socket unavailable" });
    return;
  }

  const participants = [
    toJid(customerPhone),
    toJid(advisorPhone),
    toJid(ADMIN_NUMBER),
  ];

  let group: Awaited<ReturnType<typeof sock.groupCreate>>;
  try {
    group = await sock.groupCreate(groupName, participants);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Group creation failed";
    console.error("[WhatsApp] groupCreate failed:", msg);
    res.status(500).json({ success: false, error: `Group creation failed: ${msg}` });
    return;
  }

  // Fetch invite link — retry 3× before returning without one
  const inviteLink = await fetchInviteLink(sock, group.id);

  let messageSent = false;
  let messageError: string | undefined;

  if (initialMessage) {
    // Wait for E2E session establishment between new group participants
    await sleep(jitter(3000, 5000));

    // Warmup: pull group metadata so Baileys caches participant keys
    try {
      await sock.groupMetadata(group.id);
    } catch { /* non-fatal */ }

    // First attempt immediately after typing simulation, then two retries
    const result = await sendWithTyping(sock, group.id, initialMessage, [0, 5000, 8000]);
    messageSent = result.sent;
    messageError = result.error;

    if (!messageSent) {
      console.error("[WhatsApp] All sendMessage attempts failed for group:", group.id);
    }
  }

  res.json({
    success: true,
    groupId: group.id,
    groupName,
    inviteLink,
    participants,
    messageSent,
    ...(messageError && { messageError }),
  });
});

// ── POST /api/whatsapp/send-message ───────────────────────────────────────────

router.post("/whatsapp/send-message", async (req: Request, res: Response) => {
  const { groupId, message } = req.body as { groupId?: string; message?: string };

  if (!groupId || !message) {
    res.status(400).json({ success: false, error: "groupId and message are required" });
    return;
  }

  if (!isWhatsAppConnected()) {
    res.status(503).json({ success: false, error: "WhatsApp not connected" });
    return;
  }

  let sock;
  try {
    sock = getSocket();
  } catch (err) {
    res.status(503).json({ success: false, error: err instanceof Error ? err.message : "Socket unavailable" });
    return;
  }

  // For existing groups: lead with a short random pause before typing (human opens app, finds chat)
  await sleep(jitter(1000, 3000));

  const result = await sendWithTyping(sock, groupId, message, [0, 8000, 15000]);

  if (result.sent) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
