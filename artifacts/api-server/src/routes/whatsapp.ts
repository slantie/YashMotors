import { Router, type Request, type Response } from "express";
import {
  getSocket,
  isWhatsAppConnected,
  toJid,
} from "../lib/whatsapp-connection";

const router = Router();

router.get("/whatsapp/status", (_req: Request, res: Response) => {
  res.json({ connected: isWhatsAppConnected() });
});

router.post("/whatsapp/create-group", async (req: Request, res: Response) => {
  const { groupName, customerPhone, advisorPhone, initialMessage } = req.body as {
    groupName?: string;
    customerPhone?: string;
    advisorPhone?: string;
    initialMessage?: string;
  };

  if (!groupName || !customerPhone) {
    res.status(400).json({ success: false, error: "groupName and customerPhone are required" });
    return;
  }

  if (!isWhatsAppConnected()) {
    res.status(503).json({
      success: false,
      error: "WhatsApp not connected. Scan the QR code in the server terminal and retry.",
    });
    return;
  }

  let sock;
  try {
    sock = getSocket();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Socket unavailable";
    res.status(503).json({ success: false, error: msg });
    return;
  }

  if (!advisorPhone) {
    res.status(400).json({ success: false, error: "advisorPhone is required" });
    return;
  }

  const participants = [
    toJid(customerPhone),
    toJid(advisorPhone),
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

  let inviteLink = "";
  try {
    const inviteCode = await sock.groupInviteCode(group.id);
    inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
  } catch (err) {
    console.error("[WhatsApp] groupInviteCode failed:", err);
    // Non-fatal — group still created
  }

  let messageSent = false;
  let messageError: string | undefined;
  if (initialMessage) {
    // Warmup: fetch metadata + subscribe presence to trigger sender-key sync
    try {
      await sock.groupMetadata(group.id);
      await sock.presenceSubscribe(group.id);
      await sock.sendPresenceUpdate("composing", group.id);
    } catch {
      // Non-fatal warmup — proceed anyway
    }

    // Retry with backoff — WA needs time to establish E2E sessions with new participants
    const delays = [3000, 5000, 8000];
    for (let i = 0; i < delays.length; i++) {
      await new Promise((r) => setTimeout(r, delays[i]));
      try {
        await sock.sendMessage(group.id, { text: initialMessage });
        messageSent = true;
        messageError = undefined;
        break;
      } catch (err) {
        messageError = err instanceof Error ? err.message : "Message send failed";
        console.error(`[WhatsApp] sendMessage attempt ${i + 1} failed:`, messageError);
      }
    }
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

// ── POST /api/whatsapp/send-message ────────────────────────────────────────────
// Send a text message to an existing group (identified by groupId JID).

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

  // Warmup — triggers sender-key exchange for existing groups
  try {
    await sock.presenceSubscribe(groupId);
    await sock.sendPresenceUpdate("composing", groupId);
  } catch { /* non-fatal */ }

  const delays = [2000, 5000, 8000];
  let lastError = "";
  for (let i = 0; i < delays.length; i++) {
    await new Promise((r) => setTimeout(r, delays[i]));
    try {
      await sock.sendMessage(groupId, { text: message });
      res.json({ success: true });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Send failed";
      console.error(`[WhatsApp] send-message attempt ${i + 1} failed:`, lastError);
    }
  }

  res.status(500).json({ success: false, error: lastError });
});

export default router;
