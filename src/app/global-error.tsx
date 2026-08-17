"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-50">
        <h1 className="text-3xl font-bold">Something broke.</h1>
        <p className="text-zinc-400">
          Not your fault. Refresh the page — the game state is safe on the
          server.
        </p>
      </body>
    </html>
  );
}
