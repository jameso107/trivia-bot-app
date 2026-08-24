"use client";

// Tactile submit for form actions (owner request 2026-08-24: buttons gave no
// sign a click landed). Pairs with the global button :active/:disabled rules
// in globals.css — this adds the busy phase: spinner + label + disabled until
// the action round-trips, so a slow magic-link send or game start is visibly
// in flight and can't be double-fired.
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function ActionButton({
  children,
  pendingText = "Working…",
  className = "",
  testId,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} data-testid={testId} className={className}>
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
