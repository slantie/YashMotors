import { router } from "expo-router";
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

export type CustomerArrivalStatus = "walk_in" | "pickup" | "customer_waiting" | "breakdown";
export type ServiceType = "service" | "repair";
export type ServiceSubType = "major" | "minor" | "breakdown" | "running";

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
  customerArrivalStatus?: CustomerArrivalStatus;
  serviceType?: ServiceType;
  serviceSubType?: ServiceSubType;
  internalStatus: InternalStatus;
  customerStatus: CustomerStatus;
  advisorId: number;
  advisorName?: string;
  primaryImageUrl?: string;
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
  createdByName?: string | null;
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
  customerArrivalStatus?: CustomerArrivalStatus;
  serviceType?: ServiceType;
  serviceSubType?: ServiceSubType;
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
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid response from server.");
    }
  }

  if (res.status === 401 && !hasRetried) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, true);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      await useAuthStore.getState().logout();
      router.replace("/login");
    }
    const errBody = data as { error?: string; message?: string } | null;
    throw new Error(errBody?.error || errBody?.message || "Request failed.");
  }

  return data as T;
}

export interface FetchCasesParams {
  /** Page size. Omit for the full list (current default behavior). Backend caps at 100. */
  limit?: number;
  /** Row offset for offset-based pagination. */
  offset?: number;
}

/**
 * Fetch cases. With no params this returns the full role-scoped list (unchanged).
 * Pass `limit`/`offset` to page — the backend exposes the total via `X-Total-Count`,
 * which a future `useInfiniteQuery` can consume.
 */
export function fetchCases(params?: FetchCasesParams): Promise<CaseListItem[]> {
  if (!params || (params.limit === undefined && params.offset === undefined)) {
    return request<CaseListItem[]>("/cases");
  }
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  return request<CaseListItem[]>(`/cases?${qs.toString()}`);
}

export function fetchTechnicianHistory(): Promise<CaseListItem[]> {
  return request<CaseListItem[]>("/cases?history=1");
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

export async function notifyAdvisor(caseNumber: string): Promise<void> {
  await request(`/cases/${encodeURIComponent(caseNumber)}/notify-advisor`, { method: "POST" });
}

export async function transferCase(
  caseNumber: string,
  targetAdvisorId: number,
  note?: string
): Promise<void> {
  await request(`/cases/${encodeURIComponent(caseNumber)}/transfer`, {
    method: "PUT",
    body: JSON.stringify({ targetAdvisorId, ...(note ? { note } : {}) }),
  });
}
