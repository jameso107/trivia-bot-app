"use client";

// Subscribe to a game's broadcast channel and resync from the server on every
// (re)join — bar wifi drops, channel rejoins, state refetches, nobody notices
// (PRD §3 resilience). Postgres is truth; this is projection.
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getGameState } from "./api";
import {
  EVT_LOBBY,
  EVT_STATE,
  EVT_TICK,
  gameChannel,
  type LobbyEvent,
  type StatePayload,
  type TickEvent,
} from "../../../supabase/functions/_shared/protocol.ts";

export function useGameChannel(
  gameId: string | null,
  handlers: {
    onState: (s: StatePayload) => void;
    onLobby?: (e: LobbyEvent) => void;
    onTick?: (e: TickEvent) => void;
  },
  opts?: {
    // Set when the caller already holds fresh state from the same round trip
    // that produced gameId (join/boot responses) — skips the redundant fetch
    // on the FIRST subscribe; genuine re-joins still resync.
    skipFirstResync?: boolean;
  },
) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const skipFirstRef = useRef(opts?.skipFirstResync ?? false);

  useEffect(() => {
    if (!gameId) return;
    let disposed = false;
    const supabase = createClient();
    const channel = supabase
      .channel(gameChannel(gameId))
      .on("broadcast", { event: EVT_STATE }, ({ payload }) => {
        handlersRef.current.onState(payload as StatePayload);
      })
      .on("broadcast", { event: EVT_LOBBY }, ({ payload }) => {
        handlersRef.current.onLobby?.(payload as LobbyEvent);
      })
      .on("broadcast", { event: EVT_TICK }, ({ payload }) => {
        handlersRef.current.onTick?.(payload as TickEvent);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (skipFirstRef.current) {
            skipFirstRef.current = false;
            return;
          }
          // Fresh join OR reconnect: pull authoritative state.
          getGameState({ gameId })
            .then((s) => {
              if (!disposed) handlersRef.current.onState(s);
            })
            .catch(() => {
              /* transient; next broadcast will correct us */
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // supabase-js auto-rejoins with backoff; the next SUBSCRIBED
          // triggers the resync above. Surfacing a UI indicator is part of
          // the M7 chaos pass.
          console.warn(`game channel ${status}; waiting for rejoin`);
        }
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);
}
