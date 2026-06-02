import { eq, inArray, or, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { notifications, users } from "../db/schema.js";
import { sendPush, sendPushToUser, type PushMessage } from "./push.js";

// ── types ──────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  userId: number;
  caseId?: number;
  eventId?: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// ── public API ─────────────────────────────────────────────────────────────────
// Delivery (chunking, ticket/receipt handling, dead-token cleanup) lives in ./push.ts.

/** Create one notification and fire push in the background. */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  await db.insert(notifications).values({
    userId: payload.userId,
    caseId: payload.caseId ?? null,
    eventId: payload.eventId ?? null,
    title: payload.title,
    body: payload.body,
  });

  void sendPushToUser(payload.userId, payload.title, payload.body, payload.data ?? {});
}

/** Create notifications for multiple users, then push in one batched Expo send. */
export async function createNotifications(payloads: NotificationPayload[]): Promise<void> {
  if (payloads.length === 0) return;

  await db.insert(notifications).values(
    payloads.map((p) => ({
      userId: p.userId,
      caseId: p.caseId ?? null,
      eventId: p.eventId ?? null,
      title: p.title,
      body: p.body,
    }))
  );

  // Resolve all recipient tokens in one query, then a single (chunked) batched send.
  void (async () => {
    const userIds = [...new Set(payloads.map((p) => p.userId))];
    const rows = await db
      .select({ id: users.id, pushToken: users.pushToken })
      .from(users)
      .where(inArray(users.id, userIds));

    const tokenById = new Map(rows.map((r) => [r.id, r.pushToken]));
    const messages: PushMessage[] = [];
    for (const p of payloads) {
      const token = tokenById.get(p.userId);
      if (token) messages.push({ to: token, title: p.title, body: p.body, data: p.data ?? {} });
    }
    await sendPush(messages);
  })();
}

/** Fetch IDs of all active admins and superadmins (excludes the actor). */
export async function getAdminUserIds(excludeUserId?: number): Promise<number[]> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        or(eq(users.role, "admin"), eq(users.role, "superadmin"))
      )
    );

  return result.filter((u) => u.id !== excludeUserId).map((u) => u.id);
}

/** Notify all active admins + superadmins. */
export async function notifyAdmins(
  payload: Omit<NotificationPayload, "userId">,
  excludeUserId?: number
): Promise<void> {
  try {
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          or(
            eq(users.role, "admin"),
            eq(users.role, "superadmin")
          )
        )
      );

    const adminIds = adminRows
      .map((r) => r.id)
      .filter((id) => id !== excludeUserId);

    if (adminIds.length === 0) return;

    await createNotifications(adminIds.map((userId) => ({ ...payload, userId })));
  } catch (err) {
    console.error("[Notifications] notifyAdmins failed:", err);
  }
}
