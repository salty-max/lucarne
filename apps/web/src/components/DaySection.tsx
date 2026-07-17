import { Fragment } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Match } from "@lucarne/shared";
import { cn } from "@/lib/utils";
import { MatchCard } from "./MatchCard";

export type MatchGroup = {
  key: string;
  label?: string;
  matches: Match[];
  tone?: "yellow" | "cyan" | "live";
};

const COLS = 6;

/** All groups in ONE table so every column lines up across sections. */
export function MatchTable({ groups }: { groups: MatchGroup[] }) {
  const navigate = useNavigate();
  const shown = groups.filter((g) => g.matches.length > 0);
  if (shown.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        <tbody>
          {shown.map((g) => (
            <Fragment key={g.key}>
              {g.label && (
                <tr>
                  <td colSpan={COLS} className="pt-4 first:pt-0">
                    <div
                      className={cn(
                        "tt-bar text-xs",
                        g.tone === "live" ? "tt-bar-live" : g.tone === "yellow" ? "tt-bar-yellow" : "",
                      )}
                    >
                      <span className="truncate">{g.label}</span>
                      <span className="tt-bar-r tabular-nums">{g.matches.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {g.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  m={m}
                  onOpen={() => navigate({ to: "/match/$id", params: { id: String(m.id) } })}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
