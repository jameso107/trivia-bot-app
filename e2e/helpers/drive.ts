// Drive a game's state machine over the API (no console browser needed) —
// hosts can legally cut questions short, so a plain advance loop walks the
// whole night.
import { advanceGame, getGameState } from "../../src/lib/game/api";

export async function advanceUntil(
  gameId: string,
  accessToken: string,
  target = "ended",
  maxSteps = 60,
): Promise<void> {
  let state = (await getGameState({ gameId })).state as string;
  while (state !== target && maxSteps-- > 0) {
    const res = await advanceGame({ gameId, expectedState: state, accessToken });
    state = res.state.state;
  }
  if (state !== target) {
    throw new Error(`game ${gameId} never reached ${target} (stuck at ${state})`);
  }
}
