import * as FileSystem from "expo-file-system/legacy";
import { useAuthStore } from "@/store/useAuthStore";

export interface CaseEvent {
  id: number;
  caseId: number;
  eventType: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdBy: number;
  createdAt: string;
}

export interface CaseEventImage {
  id: number;
  caseId: number;
  eventId: number;
  s3Key: string;
  filename: string;
  folder: "intake" | "repairs";
  mediaType: "image" | "video";
  isPrimary: boolean;
  url: string;
  uploadedBy: number;
  createdAt: string;
}

export interface PresignInput {
  filename: string;
  contentType: string;
  folder: "intake" | "repairs";
}

export interface PresignResult {
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface ConfirmImageItem {
  key: string;
  filename: string;
  folder: "intake" | "repairs";
  mediaType?: "image" | "video";
  isPrimary?: boolean;
  timestampClick?: number;
  lat?: number;
  lng?: number;
}

export interface ConfirmImagesResult {
  event: CaseEvent;
  images: CaseEventImage[];
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

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 401 && !hasRetried) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) return request<T>(path, init, true);
  }

  if (!res.ok) {
    if (res.status === 401) await useAuthStore.getState().logout();
    throw new Error(
      data?.error || data?.message || "Request failed."
    );
  }

  return data as T;
}

export function addEvent(
  caseNumber: string,
  payload: { eventType: "technician_update" | "customer_update"; message: string }
): Promise<CaseEvent> {
  return request<CaseEvent>(
    `/cases/${encodeURIComponent(caseNumber)}/events`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function editCase(
  caseNumber: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/cases/${encodeURIComponent(caseNumber)}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export function fetchImages(
  caseNumber: string,
  folder?: string
): Promise<CaseEventImage[]> {
  const params = folder ? `?folder=${encodeURIComponent(folder)}` : "";
  return request<CaseEventImage[]>(
    `/cases/${encodeURIComponent(caseNumber)}/images${params}`
  );
}

export function deleteImage(
  caseNumber: string,
  imageId: number
): Promise<void> {
  return request<void>(
    `/cases/${encodeURIComponent(caseNumber)}/images/${imageId}`,
    { method: "DELETE" }
  );
}

export function presignImage(
  caseNumber: string,
  payload: PresignInput
): Promise<PresignResult> {
  return request<PresignResult>(
    `/cases/${encodeURIComponent(caseNumber)}/images/presign`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function confirmImages(
  caseNumber: string,
  images: ConfirmImageItem[]
): Promise<ConfirmImagesResult> {
  return request<ConfirmImagesResult>(
    `/cases/${encodeURIComponent(caseNumber)}/images/confirm`,
    { method: "POST", body: JSON.stringify({ images }) }
  );
}

export async function uploadImageToS3(
  uploadUrl: string,
  uri: string,
  contentType: string
): Promise<void> {
  console.log(`[s3] PUT uri=${uri} contentType=${contentType}`);
  const result = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "PUT",
    headers: { "Content-Type": contentType },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  console.log(`[s3] response status=${result.status} body=${result.body?.slice(0, 200)}`);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`S3 upload failed: status=${result.status} body=${result.body?.slice(0, 300)}`);
  }
}
