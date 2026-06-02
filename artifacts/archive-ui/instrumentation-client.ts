import * as Sentry from "@sentry/nextjs";

// Client-side init. No DSN => no-op. Use NEXT_PUBLIC_SENTRY_DSN for the browser bundle.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
