import type { MatchEvent } from "@lucarne/shared";

/** The kind of visual mark an event gets, or null if it isn't shown (subs, VAR). */
export type EventMarkKind = "goal" | "yellow" | "red";

export function eventMark(e: MatchEvent): EventMarkKind | null {
  if (e.type === "Goal") return "goal";
  if (e.type === "Card") return e.detail === "Yellow Card" ? "yellow" : "red";
  return null;
}

export function eventName(e: MatchEvent): string {
  let name = e.player ?? "";
  if (e.type === "Goal" && e.detail === "Penalty") name += " (pen)";
  if (e.type === "Goal" && e.detail === "Own Goal") name += " (og)";
  return name;
}
