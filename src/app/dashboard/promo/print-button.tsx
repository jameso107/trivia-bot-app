"use client";

import { logPromoDownload } from "../actions";

export function PrintButton() {
  return (
    <button
      type="button"
      data-testid="print-flyer"
      onClick={() => {
        // Frozen §8 event first (fire-and-forget), then the print dialog.
        void logPromoDownload();
        window.print();
      }}
      className="rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
    >
      Print flyer
    </button>
  );
}
