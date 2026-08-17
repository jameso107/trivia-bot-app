import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn), // no DSN (local/CI) => SDK is a silent no-op
  tracesSampleRate: 0.1,
});
