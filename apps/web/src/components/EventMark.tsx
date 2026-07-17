import { cn } from "@/lib/utils";
import type { EventMarkKind } from "@/lib/matchEvents";
import { GoalIcon } from "./GoalIcon";

/** A crisp vector mark for an event — a soccer ball for goals, a referee's card
 *  for bookings — so nothing depends on the OS emoji font. */
export function EventMark({ kind }: { kind: EventMarkKind }) {
  if (kind === "goal") {
    return <GoalIcon className="h-3.5 w-3.5" />;
  }
  return (
    <svg
      viewBox="6 3 12 18"
      className={cn("h-3.5 w-3.5", kind === "yellow" ? "text-yellow-400" : "text-red-500")}
      aria-hidden
    >
      <rect
        x="7.5"
        y="4"
        width="9"
        height="16"
        rx="1.7"
        fill="currentColor"
        transform="rotate(9 12 12)"
      />
    </svg>
  );
}
