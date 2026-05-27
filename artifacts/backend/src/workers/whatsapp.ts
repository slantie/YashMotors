import { Worker, type Processor } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cases, caseEvents } from "../db/schema.js";
import { redis } from "../lib/redis.js";
import { env } from "../env.js";
import { createNotification, notifyAdmins } from "../lib/notifications.js";
import type {
  WhatsAppJobData,
  CreateGroupJobData,
  SendMessageJobData,
  AddToGroupJobData,
} from "../lib/queue.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

// ── helpers ────────────────────────────────────────────────────────────────────

async function callBaileys<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.WHATSAPP_INTERNAL_SECRET) {
    headers["x-internal-secret"] = env.WHATSAPP_INTERNAL_SECRET;
  }
  const res = await fetch(`${env.WHATSAPP_API_URL}/api${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { success?: boolean; error?: string };
  if (!res.ok || (data as { success?: boolean }).success === false) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data;
}

// ── job processors ─────────────────────────────────────────────────────────────

async function processCreateGroup(data: CreateGroupJobData): Promise<void> {
  const [currentCase] = await db.select({ id: cases.id, deletedAt: cases.deletedAt })
    .from(cases).where(eq(cases.id, data.caseId)).limit(1);
  if (!currentCase || currentCase.deletedAt !== null) {
    console.log(`[WA Worker] Case ${data.caseId} deleted — skipping create_group job`);
    return;
  }

  // Random human-like delay before triggering action (3–8 s)
  await sleep(jitter(3000, 8000));

  const result = await callBaileys<{
    groupId: string;
    inviteLink?: string;
    messageSent: boolean;
    messageError?: string;
  }>("/whatsapp/create-group", {
    groupName: data.groupName,
    customerPhone: data.customerPhone,
    advisorPhone: data.advisorPhone,
    initialMessage: data.initialMessage,
  });

  await db
    .update(cases)
    .set({
      whatsappGroupId: result.groupId,
      whatsappInviteLink: result.inviteLink ?? null,
      whatsappStatus: "created",
      updatedAt: new Date(),
    })
    .where(eq(cases.id, data.caseId));

  const [groupEvent] = await db.insert(caseEvents).values({
    caseId: data.caseId,
    eventType: "group_created",
    createdBy: data.requestedBy,
    metadata: {
      groupId: result.groupId,
      inviteLink: result.inviteLink,
      messageSent: result.messageSent,
      ...(result.messageError && { messageError: result.messageError }),
    },
  }).returning();

  // Notify the case advisor that their group is ready
  void createNotification({
    userId: data.requestedBy,
    caseId: data.caseId,
    eventId: groupEvent.id,
    title: `WhatsApp group created — ${data.caseNumber}`,
    body: result.inviteLink
      ? `Group ready. Invite: ${result.inviteLink}`
      : "Group created successfully.",
    data: { caseNumber: data.caseNumber },
  });
}

async function processSendMessage(data: SendMessageJobData): Promise<void> {
  const [currentCase] = await db.select({ id: cases.id, deletedAt: cases.deletedAt })
    .from(cases).where(eq(cases.id, data.caseId)).limit(1);
  if (!currentCase || currentCase.deletedAt !== null) {
    console.log(`[WA Worker] Case ${data.caseId} deleted — skipping send_message job`);
    return;
  }

  // Longer delay for messages — less urgent, more human-like (5–15 s)
  await sleep(jitter(5000, 15000));

  await callBaileys("/whatsapp/send-message", {
    groupId: data.groupId,
    message: data.message,
  });

  await db.insert(caseEvents).values({
    caseId: data.caseId,
    eventType: "message_sent",
    createdBy: data.requestedBy,
    message: data.message,
    metadata: { groupId: data.groupId },
  });
}

async function processAddToGroup(data: AddToGroupJobData): Promise<void> {
  const [currentCase] = await db.select({ id: cases.id, deletedAt: cases.deletedAt })
    .from(cases).where(eq(cases.id, data.caseId)).limit(1);
  if (!currentCase || currentCase.deletedAt !== null) {
    console.log(`[WA Worker] Case ${data.caseId} deleted — skipping add_to_group job`);
    return;
  }

  await sleep(jitter(1000, 3000));

  await callBaileys("/whatsapp/add-to-group", {
    groupId: data.groupId,
    phones: data.phones,
  });

  console.log(`[WA Worker] Added ${data.newAdvisorName} to WA group for case ${data.caseNumber}`);
}

// ── worker ─────────────────────────────────────────────────────────────────────

const processor: Processor<WhatsAppJobData> = async (job) => {
  if (job.data.type === "create_group") return processCreateGroup(job.data);
  if (job.data.type === "send_message") return processSendMessage(job.data);
  if (job.data.type === "add_to_group") return processAddToGroup(job.data);
};

export function startWhatsAppWorker(): void {
  const worker = new Worker<WhatsAppJobData>("whatsapp", processor, {
    connection: redis,
    concurrency: 1, // One job at a time — prevents WhatsApp rate triggers
  });

  worker.on("completed", (job) => {
    console.log(`[WA Worker] ${job.data.type} job ${job.id} done`);
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[WA Worker] ${job.data.type} job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);

    // Only mark final failure after all retry attempts are exhausted
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts && job.data.type === "create_group") {
      try {
        await db
          .update(cases)
          .set({ whatsappStatus: "failed", updatedAt: new Date() })
          .where(eq(cases.id, job.data.caseId));

        const [failEvent] = await db.insert(caseEvents).values({
          caseId: job.data.caseId,
          eventType: "group_failed",
          createdBy: job.data.requestedBy,
          metadata: { error: err.message, attempts: job.attemptsMade },
        }).returning();

        void createNotification({
          userId: job.data.requestedBy,
          caseId: job.data.caseId,
          eventId: failEvent.id,
          title: `Group creation failed — ${job.data.caseNumber}`,
          body: "WhatsApp group could not be created. Tap to retry.",
          data: { caseNumber: job.data.caseNumber },
        });
        void notifyAdmins(
          {
            caseId: job.data.caseId,
            eventId: failEvent.id,
            title: `WA group failed — ${job.data.caseNumber}`,
            body: err.message,
            data: { caseNumber: job.data.caseNumber },
          },
          job.data.requestedBy
        );
      } catch (dbErr) {
        console.error("[WA Worker] Failed to write failure event to DB:", dbErr);
      }
    }

    if (job.attemptsMade >= maxAttempts && job.data.type === "send_message") {
      try {
        const [failEvent] = await db.insert(caseEvents).values({
          caseId: job.data.caseId,
          eventType: "message_failed",
          createdBy: job.data.requestedBy,
          metadata: { groupId: job.data.groupId, error: err.message, attempts: job.attemptsMade },
        }).returning();

        void createNotification({
          userId: job.data.requestedBy,
          caseId: job.data.caseId,
          eventId: failEvent.id,
          title: `Message send failed — ${job.data.caseNumber}`,
          body: "WhatsApp message could not be delivered after multiple attempts.",
          data: { caseNumber: job.data.caseNumber },
        });
      } catch (dbErr) {
        console.error("[WA Worker] Failed to write send_message failure event to DB:", dbErr);
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[WA Worker] Worker error:", err.message);
  });

  console.log("[WA Worker] Started (concurrency=1)");
}
