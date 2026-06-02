import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

export type AuthRole = "superadmin" | "admin" | "advisor" | "technician";

export interface AuthUser {
  id: number | string;
  name: string;
  role: AuthRole;
  phone: string;
  avatarUrl?: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
}

export const ACCESS_TOKEN_KEY = "ym-access-token";
export const REFRESH_TOKEN_KEY = "ym-refresh-token";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function apiUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function storeTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = decodeBase64Url(payload);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of normalized.replace(/=+$/, "")) {
    const index = BASE64_CHARS.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  const encoded = bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  return decodeURIComponent(encoded);
}

function userFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const id = payload.userId;
  const name = payload.name;
  const role = payload.role;
  const phone = payload.phone;

  if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string" || typeof role !== "string" || typeof phone !== "string") {
    return null;
  }

  return { id, name, role: role as AuthRole, phone };
}

function isTokenExpired(token: string) {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") return true;
  return exp * 1000 <= Date.now() + 30_000;
}

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const body = (await response.json().catch(() => ({}))) as Partial<AuthResponse> & {
    error?: string;
  };

  if (response.status === 404) {
    throw new Error("Auth endpoint not found. Check EXPO_PUBLIC_API_URL.");
  }

  if (response.status >= 500) {
    throw new Error("Auth server error. Please try again.");
  }

  if (!response.ok || !body.accessToken || !body.refreshToken) {
    throw new Error(body.error || "Authentication failed.");
  }

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    user: body.user,
  };
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: false,

  login: async (phone, pin) => {
    set({ isLoading: true });
    try {
      const response = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await parseAuthResponse(response);
      const user = data.user ?? userFromToken(data.accessToken);
      if (!user) throw new Error("Login response did not include a user.");

      await storeTokens(data.accessToken, data.refreshToken);
      set({ user, accessToken: data.accessToken, isLoading: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw normalizeAuthError(error);
    }
  },

  logout: async () => {
    const accessToken = get().accessToken ?? (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY));
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

    try {
      if (accessToken) {
        await fetch(apiUrl("/auth/logout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => undefined);
      }
    } catch {
      // Local logout should still succeed if config/server is unavailable.
    } finally {
      await clearTokens();
      set({ user: null, accessToken: null, isLoading: false });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (accessToken && !isTokenExpired(accessToken)) {
        const user = userFromToken(accessToken);
        if (!user) {
          await clearTokens();
          set({ user: null, accessToken: null, isLoading: false });
          return;
        }
        set({
          accessToken,
          user,
          isLoading: false,
        });
        return;
      }

      const refreshed = await get().refreshAccessToken();
      set({ isLoading: false });
      if (!refreshed) {
        await clearTokens();
        set({ user: null, accessToken: null });
      }
    } catch {
      await clearTokens();
      set({ user: null, accessToken: null, isLoading: false });
    }
  },

  refreshAccessToken: async () => {
    // Deduplicate concurrent refreshes. When multiple in-flight requests get a 401 at
    // once (common on foreground after the 15-min access token expires), they must share
    // ONE /auth/refresh call. Otherwise the first rotates the refresh token and the rest
    // present a now-invalid token, get 401, and eject a legitimately logged-in user.
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) return null;

      try {
        const response = await fetch(apiUrl("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await parseAuthResponse(response);
        const user = data.user ?? userFromToken(data.accessToken);

        await storeTokens(data.accessToken, data.refreshToken);
        set({
          accessToken: data.accessToken,
          user: user ?? get().user,
        });
        return data.accessToken;
      } catch {
        await clearTokens();
        set({ user: null, accessToken: null });
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  },
}));

// Module-level singleton so all callers (apiClient, caseEvents, cases) share one refresh.
// Kept out of the Zustand store to avoid serializing a Promise into devtools/persist.
let inFlightRefresh: Promise<string | null> | null = null;

function normalizeAuthError(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes("Network request failed") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      return new Error("Cannot reach backend. Check EXPO_PUBLIC_API_URL and start the auth server.");
    }
    return error;
  }
  return new Error("Authentication failed.");
}
