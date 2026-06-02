/**
 * Expo push delivery (MEDIUM-004).
 *
 * Implements the two-phase Expo model the previous fire-and-forget code skipped:
 *   1. Send messages (chunked, Expo accepts up to 100 per request) and inspect the
 *      immediate *tickets*. A ticket error of `DeviceNotRegistered` means the token is
 *      dead → clear it from `users.pushToken` so we stop wasting calls on it.
 *   2. A short while later, poll the *receipts* for the accepted tickets. Receipts can
 *      report `DeviceNotRegistered` too (the device unregistered after the push was
 *      accepted) → clear those tokens as well.
 *
 * Receipt polling is in-process (a single deferred timer holding a ticket→token map).
 * That covers the common reinstall/rotation case without a new table; it does not
 * survive a process restart between send and poll — durable receipt tracking would need
 * a persisted tickets table and is left as a follow-up.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { logger } from "./logger.js";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const CHUNK_SIZE = 100;
const RECEIPT_DELAY_MS = 15_000;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function clearToken(token: string): Promise<void> {
  try {
    await db.update(users).set({ pushToken: null }).where(eq(users.pushToken, token));
    logger.info({ event: "push.token_cleared" }, "Cleared dead Expo push token");
  } catch (err) {
    logger.error({ err }, "[push] failed clearing dead token");
  }
}

/**
 * Send push messages. Handles immediate ticket errors (dead-token cleanup) and schedules
 * a receipt poll for accepted tickets. Returns the count of messages Expo accepted.
 */
export async function sendPush(messages: PushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  let accepted = 0;
  const ticketToToken = new Map<string, string>();

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];

      tickets.forEach((ticket, idx) => {
        const token = chunk[idx]?.to;
        if (!token) return;
        if (ticket.status === "ok") {
          accepted++;
          if (ticket.id) ticketToToken.set(ticket.id, token);
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          void clearToken(token);
        }
      });
    } catch (err) {
      logger.error({ err }, "[push] send chunk failed");
    }
  }

  if (ticketToToken.size > 0) {
    const timer = setTimeout(() => void checkReceipts(ticketToToken), RECEIPT_DELAY_MS);
    // Don't keep the event loop alive purely for the receipt poll.
    timer.unref?.();
  }

  return accepted;
}

async function checkReceipts(ticketToToken: Map<string, string>): Promise<void> {
  const ids = [...ticketToToken.keys()];
  try {
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: Record<string, ExpoTicket>;
      } | null;
      const receipts = json?.data ?? {};

      for (const [ticketId, receipt] of Object.entries(receipts)) {
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          const token = ticketToToken.get(ticketId);
          if (token) void clearToken(token);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "[push] receipt check failed");
  }
}

/**
 * Resolve a user's token, send a single push, and prune the token if it's dead.
 * Returns true if Expo accepted the message.
 */
export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<boolean> {
  const [user] = await db
    .select({ pushToken: users.pushToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.pushToken) return false;
  const accepted = await sendPush([{ to: user.pushToken, title, body, data }]);
  return accepted > 0;
}
