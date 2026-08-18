"use client";

import { useState } from "react";
import { logPromoDownload } from "../actions";

export function PrintButton() {
  const [logged, setLogged] = useState(false);
  return (
    <button
      type="button"
      data-testid="print-flyer"
      data-logged={logged}
      onClick={async () => {
        // The frozen §8 event must land before anything can interrupt the
        // page (navigation cancels in-flight actions — bit us in CI).
        try {
          await logPromoDownload();
        } finally {
          setLogged(true);
        }
        window.print();
      }}
      className="rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
    >
      Print flyer
    </button>
  );
}
