import { Queue } from "bullmq";
import { redis } from "./redis.js";

export interface CreateGroupJobData {
  type: "create_group";
  caseId: number;
  caseNumber: string;
  groupName: string;
  customerPhone: string;
  advisorPhone: string;
  initialMessage?: string;
  requestedBy: number;
}

export interface SendMessageJobData {
  type: "send_message";
  caseId: number;
  caseNumber: string;
  groupId: string;
  message: string;
  requestedBy: number;
}

export interface AddToGroupJobData {
  type: "add_to_group";
  caseId: number;
  caseNumber: string;
  groupId: string;
  phones: string[];
  newAdvisorName: string;
  requestedBy: number;
}

export type WhatsAppJobData = CreateGroupJobData | SendMessageJobData | AddToGroupJobData;

export const waQueue = new Queue<WhatsAppJobData>("whatsapp", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});
