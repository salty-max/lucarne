import { and, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matchEvents, matches, pushNotified, teams } from "@/db/schema";
import { deliver, getVapid, type PushTrigger } from "@/lib/push";
import { devicesWatching, loadWatchState } from "@/lib/surveillance";

const KICKOFF_LEAD_MS = 11 * 60_000; // notify up to ~10 min before kickoff

/** Stable per-event key so re-fetching a match's events never double-notifies.
 *  Deliberately omits the player name — the API often refines it after the fact
 *  (e.g. "Mbappé" → "K. Mbappé"), which would look like a new event. Team + minute
 *  (+ red/yellow for cards) identifies an event uniquely enough in practice. */
function eventKey(e: {
  teamId: number | null;
  minute: number | null;
  extraMinute: number | null;
  type: string;
  detail: string | null;
}): string {
  const card = e.type === "Card" ? ((e.detail ?? "").includes("Red") ? ":R" : ":Y") : "";
  return `${e.type}:${e.teamId ?? 0}:${e.minute ?? 0}:${e.extraMinute ?? 0}${card}`;
}

function minuteLabel(min: number | null, extra: number | null): string {
  if (min == null) return "";
  return `${min}${extra ? "+" + extra : ""}'`;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/**
 * Scan the matches around now that involve a followed team, and push their new
 * events (goals, cards), imminent kickoffs and full-times — each exactly once
 * (deduped via `push_notified`). Meant to run on the live cadence, after enrich.
 */
export async function runPushNotify(now = new Date()): Promise<{ sent: number; fired: number }> {
  if (!getVapid()) return { sent: 0, fired: 0 };

  // Everyone's surveillance state; if nobody watches anything, there's no work.
  const st = await loadWatchState();
  if (st.devices.size === 0) return { sent: 0, fired: 0 };

  const nowMs = now.getTime();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const rows = await db
    .select({
      id: matches.id,
      status: matches.status,
      statusShort: matches.statusShort,
      kickoff: matches.kickoff,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homeId: matches.homeTeamId,
      awayId: matches.awayTeamId,
      home: home.name,
      away: away.name,
      lineupsFetchedAt: matches.lineupsFetchedAt,
      motmName: matches.motmName,
      motmRating: matches.motmRating,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(
      and(
        gte(matches.kickoff, new Date(nowMs - 5 * 60 * 60_000)), // a full match + ET + late ratings back
        lte(matches.kickoff, new Date(nowMs + 60 * 60_000)), // pre-match (lineups ~40 min out)
      ),
    );

  const relevant = rows
    .map((m) => ({
      m,
      watchers: new Set(devicesWatching(st, { id: m.id, homeName: m.home, awayName: m.away })),
    }))
    .filter((x) => x.watchers.size > 0);
  if (relevant.length === 0) return { sent: 0, fired: 0 };

  let sent = 0;
  let fired = 0;
  const score = (m: { homeGoals: number | null; awayGoals: number | null }) =>
    `${m.homeGoals ?? 0}–${m.awayGoals ?? 0}`;

  for (const { m, watchers } of relevant) {
    // Title is ALWAYS the fixture, body is the event — so two notifications from
    // two different live matches are instantly distinguishable.
    const title = `${m.home} – ${m.away}`;
    const notified = new Set(
      (await db.select({ key: pushNotified.key }).from(pushNotified).where(eq(pushNotified.matchId, m.id))).map(
        (r) => r.key,
      ),
    );
    const fresh: string[] = [];
    const fire = async (key: string, trigger: PushTrigger, body: string) => {
      if (notified.has(key)) return;
      fresh.push(key);
      fired++;
      sent += await deliver({ title, body, matchId: m.id, tag: `match-${m.id}` }, { deviceIds: watchers, trigger });
    };

    // Lineups (~40 min out) + kickoff reminder.
    if (m.lineupsFetchedAt != null) await fire("LINEUPS", "lineups", "Compositions disponibles");
    if (m.status === "scheduled" && m.kickoff.getTime() - nowMs <= KICKOFF_LEAD_MS && m.kickoff.getTime() > nowMs) {
      await fire("KO", "kickoff", "Coup d'envoi imminent");
    }

    // Phase transitions — each fires once.
    if (m.status === "live") {
      if (m.statusShort === "HT") await fire("HT", "ht", `⏸ Mi-temps · ${score(m)}`);
      else if (m.statusShort === "ET" || m.statusShort === "BT") await fire("ET", "phase", "⏱ Prolongations");
      else if (m.statusShort === "P") await fire("PENS", "phase", "🥅 Séance de tirs au but");
    }

    // Goals + cards (need the events; also reused for the full-time scorers).
    let events: (typeof matchEvents.$inferSelect)[] = [];
    if (m.status === "live" || m.status === "finished") {
      events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id));
      for (const e of events) {
        if (!e.player) continue; // never notify without the player's name — wait a tick
        const key = eventKey(e);
        if (notified.has(key)) continue;
        const min = minuteLabel(e.minute, e.extraMinute);
        const detail = e.detail ?? "";
        if (e.type === "Goal") {
          if (detail === "Missed Penalty") {
            await fire(key, "goal", `❌ Penalty manqué · ${e.player} ${min}`.trim());
          } else {
            const og = detail === "Own Goal" ? " (csc)" : "";
            await fire(key, "goal", `⚽ ${score(m)} · ${e.player}${og} ${min}`.trim());
          }
        } else if (e.type === "Card") {
          if (detail.includes("Second Yellow")) {
            await fire(key, "red", `🟥 Expulsion (2e jaune) · ${e.player} ${min}`.trim());
          } else if (detail.includes("Red")) {
            await fire(key, "red", `🟥 Carton rouge · ${e.player} ${min}`.trim());
          } else if (detail.includes("Yellow")) {
            await fire(key, "yellow", `🟨 Carton jaune · ${e.player} ${min}`.trim());
          }
        }
      }
    }

    // Full-time — with the scorers.
    if (m.status === "finished") {
      const scorers = (teamId: number) =>
        events
          .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty" && e.teamId === teamId && e.player)
          .map((e) => lastName(e.player as string))
          .join(", ");
      const line = [scorers(m.homeId), scorers(m.awayId)].filter(Boolean).join(" / ");
      await fire("FT", "ft", `⏱ Fin · ${score(m)}${line ? ` · ${line}` : ""}`);
    }

    // Man of the match — once the ratings resolved it.
    if (m.status === "finished" && m.motmName != null) {
      const r = m.motmRating != null ? ` (${m.motmRating})` : "";
      await fire("MOTM", "motm", `⭐ Homme du match · ${m.motmName}${r}`);
    }

    if (fresh.length > 0) {
      await db
        .insert(pushNotified)
        .values(fresh.map((key) => ({ matchId: m.id, key })))
        .onConflictDoNothing();
    }
  }

  return { sent, fired };
}
