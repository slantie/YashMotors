import { eq, inArray, or, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { notifications, users } from "../db/schema.js";

// ── types ──────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  userId: number;
  caseId?: number;
  eventId?: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// ── push ───────────────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify([{ to: token, title, body, sound: "default", data }]),
  });

  const result = (await res.json()) as {
    data: Array<{ status: string; details?: { error?: string } }>;
  };

  const ticket = result.data?.[0];
  if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
    // Token is stale — clear it so we don't waste future calls
    await db
      .update(users)
      .set({ pushToken: null })
      .where(eq(users.pushToken, token));
  }
}

async function pushForUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const [user] = await db
      .select({ pushToken: users.pushToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.pushToken) {
      await sendExpoPush(user.pushToken, title, body, data);
    }
  } catch (err) {
    console.error("[Push] Failed for user", userId, err);
  }
}

// ── public API ─────────────────────────────────────────────────────────────────

/** Create one notification and fire push in the background. */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  await db.insert(notifications).values({
    userId: payload.userId,
    caseId: payload.caseId ?? null,
    eventId: payload.eventId ?? null,
    title: payload.title,
    body: payload.body,
  });

  void pushForUser(payload.userId, payload.title, payload.body, payload.data ?? {});
}

/** Create notifications for multiple users in parallel. */
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

  // Fire push per user in parallel — non-blocking
  void Promise.all(
    payloads.map((p) => pushForUser(p.userId, p.title, p.body, p.data ?? {}))
  );
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
