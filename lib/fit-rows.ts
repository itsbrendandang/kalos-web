// How close a fit is to the engine's complete-row cap. The engine fits on `n` complete rows (AnalyzeResult.n)
// and reports its cap as `run.max_fit_rows` (RunRecord). Every measured result adds a complete row to the fit,
// so the room left is what the loop has before the engine refuses to re-analyze.
import { formatNumber } from "@/lib/format";

/** Share of the cap at which Setup starts to say so. */
export const NEAR_CAP_SHARE = 0.8;

export type FitRoom = {
  used: number;
  limit: number;
  left: number;
  state: "room" | "near" | "full";
};

/** The room left under the cap, or null when the engine did not report a usable count and cap. */
export function fitRoom(used: number | null | undefined, limit: number | null | undefined): FitRoom | null {
  if (used == null || limit == null || !Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0 || used < 0) return null;
  const left = Math.max(0, limit - used);
  const state = left === 0 ? "full" : used >= limit * NEAR_CAP_SHARE ? "near" : "room";
  return { used, limit, left, state };
}

/** One plain sentence when the fit is near or at the cap; null while there is plenty of room (nothing to say). */
export function fitRoomSentence(room: FitRoom | null): string | null {
  if (!room || room.state === "room") return null;
  const used = formatNumber(room.used, "count");
  const limit = formatNumber(room.limit, "count");
  if (room.state === "full") {
    return `The model already uses all ${limit} complete runs it can take. Each measured result adds a complete run, so the next update may be refused.`;
  }
  return `The model uses ${used} of the ${limit} complete runs it can take. Each measured result adds a run, so after about ${formatNumber(room.left, "count")} more the model stops updating.`;
}
