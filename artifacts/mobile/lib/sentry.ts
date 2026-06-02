import * as Sentry from "@sentry/react-native";

// No DSN => no-op (safe for local dev / Expo Go). Set EXPO_PUBLIC_SENTRY_DSN in eas.json
// env (per profile) to enable crash reporting in built APKs.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_ENV ?? "production",
    tracesSampleRate: 0.1,
    // Never ship verbose breadcrumbs from dev console noise to prod.
    enableNativeFramesTracking: true,
  });
}

export { Sentry };

/** Report a caught error to Sentry (no-op if Sentry is not initialized). */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
