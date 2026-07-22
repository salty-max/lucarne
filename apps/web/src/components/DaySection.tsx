import { Fragment } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Match } from "@lucarne/shared";
import { cn } from "@/lib/utils";
import { competitionLabel } from "@/lib/labels";
import { useSettings } from "@/lib/settings";
import { MatchCard } from "./MatchCard";

export type MatchGroup = {
  key: string;
  label?: string;
  matches: Match[];
  tone?: "yellow" | "cyan" | "live";
};

const COLS = 6;

/** All groups in ONE table so every column lines up across sections. When the
 * page already groups by channel (broadcasters), pass `hideBroadcasters` to drop
 * the now-redundant per-row broadcaster badges. */
export function MatchTable({
  groups,
  hideBroadcasters,
  groupByCompetition,
}: {
  groups: MatchGroup[];
  hideBroadcasters?: boolean;
  /** Insert a competition sub-header whenever the competition changes within a
   *  group. Assumes the group's matches are already competition-sorted. */
  groupByCompetition?: boolean;
}) {
  const navigate = useNavigate();
  const { lang } = useSettings();
  const shown = groups.filter((g) => g.matches.length > 0);
  if (shown.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse tabular-nums">
        <tbody>
          {shown.map((g) => (
            <Fragment key={g.key}>
              {g.label && (
                <tr>
                  <td colSpan={COLS} className="pt-4 first:pt-0">
                    <div
                      className={cn(
                        "tt-bar ",
                        g.tone === "live" ? "tt-bar-live" : g.tone === "yellow" ? "tt-bar-yellow" : "",
                      )}
                    >
                      <span className="truncate">{g.label}</span>
                      <span className="tt-bar-r tabular-nums">{g.matches.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {g.matches.map((m, i) => {
                const newComp =
                  groupByCompetition &&
                  (i === 0 || g.matches[i - 1].competition.slug !== m.competition.slug);
                return (
                  <Fragment key={m.id}>
                    {newComp && (
                      <tr>
                        <td colSpan={COLS} className="pt-2">
                          <div className="tt-subbar">
                            <span className="truncate">
                              {competitionLabel(m.competition.name, lang)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <MatchCard
                      m={m}
                      hideBroadcasters={hideBroadcasters}
                      onOpen={() => navigate({ to: "/match/$id", params: { id: String(m.id) } })}
                    />
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
