import * as Sentry from "@sentry/node";

// No-op when SENTRY_DSN is unset (safe for local dev). Import first in the entrypoint.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

export { Sentry };
