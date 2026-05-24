import { useAuthStore } from "@/store/useAuthStore";

export type Role = "superadmin" | "admin" | "advisor" | "technician";

export type InternalStatus =
  | "intake"
  | "in_progress"
  | "awaiting_parts"
  | "denting"
  | "painting"
  | "polishing"
  | "electrical"
  | "washing"
  | "quality_check"
  | "ready"
  | "delivered"
  | "cancelled";

export type CustomerStatus =
  | "received"
  | "in_repair"
  | "final_inspection"
  | "ready_for_delivery"
  | "delivered";

export interface CaseListItem {
  id: number;
  caseNumber: string;
  vehicleNumber: string;
  carModel: string;
  customerPhone?: string;
  customerName?: string;
  kmCount?: string;
  dueDate?: string;
  deliveryType?: string;
  notes?: string;
  internalStatus: InternalStatus;
  customerStatus: CustomerStatus;
  advisorId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaseEvent {
  id: number;
  caseId: number;
  eventType: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdBy: number;
  createdAt: string;
}

export interface CaseDetail extends CaseListItem {
  kmCount?: string;
  dueDate?: string;
  deliveryType?: string;
  notes?: string;
  advisor: { id: number; name: string; phone: string };
  events: CaseEvent[];
}

export type Case = CaseDetail;

export interface CreateCaseBody {
  vehicleNumber: string;
  carModel: string;
  customerPhone?: string;
  customerName?: string;
  kmCount?: string;
  dueDate?: string;
  deliveryType?: string;
  notes?: string;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

function apiUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function request<T>(path: string, init?: RequestInit, hasRetried = false): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : null),
    ...(token ? { Authorization: `Bearer ${token}` } : null),
  };

  const res = await fetch(apiUrl(path), { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 401 && !hasRetried) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, true);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      await useAuthStore.getState().logout();
    }
    throw new Error(data?.error || data?.message || "Request failed.");
  }

  return data as T;
}

export function fetchCases(): Promise<CaseListItem[]> {
  return request<CaseListItem[]>("/cases");
}

export function fetchCase(caseNumber: string): Promise<CaseDetail> {
  return request<CaseDetail>(`/cases/${encodeURIComponent(caseNumber)}`);
}

export function createCase(body: CreateCaseBody): Promise<Case> {
  return request<Case>("/cases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateInternalStatus(
  caseNumber: string,
  status: InternalStatus,
  note?: string
): Promise<void> {
  await request(`/cases/${encodeURIComponent(caseNumber)}/internal-status`, {
    method: "PUT",
    body: JSON.stringify({ status, note }),
  });
}

export async function updateCustomerStatus(
  caseNumber: string,
  status: CustomerStatus
): Promise<void> {
  await request(`/cases/${encodeURIComponent(caseNumber)}/customer-status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteCase(caseNumber: string): Promise<void> {
  await request(`/cases/${encodeURIComponent(caseNumber)}`, { method: "DELETE" });
}
