import { inArray } from "drizzle-orm";
import type { Broadcaster } from "@lucarne/shared";
import { db } from "@/db";
import { broadcasters, broadcastOverrides, broadcastRules } from "@/db/schema";
import type { Broadcaster as DbBroadcaster, Match } from "@/db/schema";
import { parisDayKey } from "@/lib/time";

/** The resolved broadcaster exactly matches the shared wire `Broadcaster` shape. */
export type ResolvedBroadcaster = Broadcaster;

export type RuleRow = {
  broadcasterId: number;
  validFrom: string;
  validTo: string;
  coverage: string;
  note: string | null;
};

export type OverrideRow = {
  broadcasterId: number;
  note: string | null;
};

/**
 * Pure resolution for a single match (no DB). Precedence:
 *   1. Per-match overrides (broadcast_overrides) — split rights (Ligue 1) or
 *      one-off free-TV matches. Authoritative.
 *   2. Otherwise every competition rule whose [validFrom, validTo] contains the
 *      match's Paris kickoff day.
 * Unknown broadcaster ids are dropped.
 */
export function resolveForMatch(
  day: string,
  byId: Map<number, DbBroadcaster>,
  overrides: OverrideRow[] | undefined,
  rules: RuleRow[] | undefined,
): ResolvedBroadcaster[] {
  if (overrides && overrides.length > 0) {
    return overrides
      .map((o): ResolvedBroadcaster | null => {
        const b = byId.get(o.broadcasterId);
        return b ? { ...b, coverage: "full", override: true, note: o.note } : null;
      })
      .filter((x): x is ResolvedBroadcaster => x !== null);
  }

  return (rules ?? [])
    .filter((r) => r.validFrom <= day && day <= r.validTo)
    .map((r): ResolvedBroadcaster | null => {
      const b = byId.get(r.broadcasterId);
      return b
        ? { ...b, coverage: r.coverage as "full" | "partial", override: false, note: r.note }
        : null;
    })
    .filter((x): x is ResolvedBroadcaster => x !== null);
}

/**
 * The heart of the app: resolve the French broadcaster(s) for a set of matches.
 * Batched — loads broadcasters/rules/overrides once, resolves in memory via
 * `resolveForMatch`.
 */
export async function resolveBroadcastersForMatches(
  matchList: Pick<Match, "id" | "competitionId" | "kickoff">[],
): Promise<Map<number, ResolvedBroadcaster[]>> {
  const result = new Map<number, ResolvedBroadcaster[]>();
  if (matchList.length === 0) return result;

  const [allBroadcasters, rules, overrides] = await Promise.all([
    db.select().from(broadcasters),
    db.select().from(broadcastRules),
    db
      .select()
      .from(broadcastOverrides)
      .where(inArray(broadcastOverrides.matchId, matchList.map((m) => m.id))),
  ]);

  const byId = new Map<number, DbBroadcaster>(allBroadcasters.map((b) => [b.id, b]));

  const overridesByMatch = new Map<number, OverrideRow[]>();
  for (const o of overrides) {
    const list = overridesByMatch.get(o.matchId) ?? [];
    list.push(o);
    overridesByMatch.set(o.matchId, list);
  }

  const rulesByCompetition = new Map<number, RuleRow[]>();
  for (const r of rules) {
    const list = rulesByCompetition.get(r.competitionId) ?? [];
    list.push(r);
    rulesByCompetition.set(r.competitionId, list);
  }

  for (const match of matchList) {
    const day = parisDayKey(match.kickoff);
    result.set(
      match.id,
      resolveForMatch(day, byId, overridesByMatch.get(match.id), rulesByCompetition.get(match.competitionId)),
    );
  }

  return result;
}
