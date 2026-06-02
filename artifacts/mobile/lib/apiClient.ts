import { router } from "expo-router";

import { useAuthStore } from "@/store/useAuthStore";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }
  const base = API_BASE_URL.replace(/\/$/, "");
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${nextPath}`;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  retrying = false
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !retrying) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
  }

  if (response.status === 401) {
    await useAuthStore.getState().logout();
    router.replace("/login");
    throw new Error("Session expired. Please log in again.");
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Request failed.");
  }

  return data as T;
}

export const apiClient = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>("POST", path, body),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),
};
