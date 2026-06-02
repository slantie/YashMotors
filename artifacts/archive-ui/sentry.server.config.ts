import * as Sentry from "@sentry/nextjs";

// No DSN => no-op. Set SENTRY_DSN in the archive's prod env to enable.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
