"use client";

// The read-in buffer, derived — no extra wire fields: the server arms
// deadline = now + read + time_limit, so "answers open" = deadline − limit.
// Returns whole seconds until answers open (0 = open / no preroll).
//
// React 19 hooks rules: no Date.now() in render, no sync setState in effects.
// Initial value comes purely from the broadcast's own timestamps; every later
// update happens inside timers (a 0ms tick covers question changes).
import { useEffect, useState } from "react";

function fromProps(deadlineTs: string | null, serverNowTs: string | null, timeLimitS: number | null): number {
  if (!deadlineTs || !serverNowTs || !timeLimitS) return 0;
  const opensAt = Date.parse(deadlineTs) - timeLimitS * 1000;
  return Math.max(0, Math.ceil((opensAt - Date.parse(serverNowTs)) / 1000));
}

export function usePreroll(
  deadlineTs: string | null,
  serverNowTs: string | null,
  timeLimitS: number | null,
): number {
  const [left, setLeft] = useState(() => fromProps(deadlineTs, serverNowTs, timeLimitS));

  useEffect(() => {
    if (!deadlineTs || !serverNowTs || !timeLimitS) {
      const t = setTimeout(() => setLeft(0), 0);
      return () => clearTimeout(t);
    }
    const skew = Date.parse(serverNowTs) - Date.now();
    const opensAt = Date.parse(deadlineTs) - timeLimitS * 1000;
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((opensAt - (Date.now() + skew)) / 1000)));
    const t = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [deadlineTs, serverNowTs, timeLimitS]);

  return left;
}
