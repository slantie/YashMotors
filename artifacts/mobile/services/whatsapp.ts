import { useAuthStore } from "@/store/useAuthStore";

export interface WhatsAppStatus {
  whatsappStatus: "pending" | "created" | "failed" | "retrying" | "manual_required" | null;
  whatsappGroupId: string | null;
  whatsappInviteLink: string | null;
}

export interface CreateGroupResult {
  jobId: string;
  whatsappStatus: string;
  groupName: string;
}

export interface SendMessageResult {
  jobId: string;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

function apiUrl(path: string) {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  hasRetried = false
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 401 && !hasRetried) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) return request<T>(path, init, true);
  }

  if (!res.ok) {
    if (res.status === 401) await useAuthStore.getState().logout();
    throw new Error(data?.error || data?.message || "Request failed.");
  }

  return data as T;
}

export function fetchWhatsAppStatus(
  caseNumber: string
): Promise<WhatsAppStatus> {
  return request<WhatsAppStatus>(
    `/cases/${encodeURIComponent(caseNumber)}/whatsapp/status`
  );
}

export function createWhatsAppGroup(
  caseNumber: string,
  advisorPhone: string,
  initialMessage?: string
): Promise<CreateGroupResult> {
  return request<CreateGroupResult>(
    `/cases/${encodeURIComponent(caseNumber)}/whatsapp/create-group`,
    {
      method: "POST",
      body: JSON.stringify({ advisorPhone, initialMessage }),
    }
  );
}

export function sendWhatsAppMessage(
  caseNumber: string,
  message: string
): Promise<SendMessageResult> {
  return request<SendMessageResult>(
    `/cases/${encodeURIComponent(caseNumber)}/whatsapp/send-message`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    }
  );
}
