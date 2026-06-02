import * as Sentry from "@sentry/node";
import { env } from "../env.js";

// Initialize Sentry only when a DSN is configured. No DSN => no-op (local/dev safe).
// Import this module as the very first thing in the entrypoint so instrumentation hooks
// are installed before other modules load.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

export { Sentry };
