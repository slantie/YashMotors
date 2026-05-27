import { useAuthStore } from "@/store/useAuthStore";

export interface UserListItem {
  id: number;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

function apiUrl(path: string) {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");
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
    try { data = JSON.parse(text); } catch { throw new Error("Invalid response from server."); }
  }

  if (res.status === 401 && !hasRetried) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) return request<T>(path, init, true);
  }

  if (!res.ok) {
    if (res.status === 401) await useAuthStore.getState().logout();
    const errBody = data as { error?: string; message?: string } | null;
    throw new Error(errBody?.error || errBody?.message || "Request failed.");
  }

  return data as T;
}

export interface CreateUserBody {
  name: string;
  phone: string;
  role: "admin" | "advisor" | "technician";
  pin?: string;
}

export function fetchUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>("/users");
}

export function createUser(body: CreateUserBody): Promise<UserListItem> {
  return request<UserListItem>("/users", {
    method: "POST",
    body: JSON.stringify({ pin: "1234", ...body }),
  });
}

export function fetchAdvisors(): Promise<UserListItem[]> {
  return fetchUsers().then((users) =>
    users.filter(
      (u) =>
        u.isActive &&
        (u.role === "advisor" || u.role === "admin" || u.role === "superadmin")
    )
  );
}
