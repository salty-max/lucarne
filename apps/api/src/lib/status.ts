/** Normalise API-Football's short status codes into the app's 4 buckets. */
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed";

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const FINISHED = new Set(["FT", "AET", "PEN"]);
const POSTPONED = new Set(["PST", "CANC", "ABD", "AWD", "WO", "SUSP"]);

export function normalizeStatus(short: string): MatchStatus {
  if (LIVE.has(short)) return "live";
  if (FINISHED.has(short)) return "finished";
  if (POSTPONED.has(short)) return "postponed";
  return "scheduled";
}
