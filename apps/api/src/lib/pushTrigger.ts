import { and, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matchEvents, matches, pushNotified, teams } from "@/db/schema";
import { deliver, getVapid, type PushTrigger } from "@/lib/push";
import { devicesWatching, loadWatchState } from "@/lib/surveillance";

const KICKOFF_LEAD_MS = 11 * 60_000; // notify up to ~10 min before kickoff

/** Notifiable category of an event, or null to ignore it. Used to bucket events
 *  per (team, category) so each gets a stable ordinal key (see runPushNotify).
 *  G = goal, PM = missed penalty, Y = yellow, Y2 = second yellow (sending-off),
 *  R = straight red. */
function eventCategory(type: string, detail: string | null): "G" | "PM" | "Y" | "Y2" | "R" | null {
  const d = detail ?? "";
  if (type === "Goal") return d === "Missed Penalty" ? "PM" : "G";
  if (type === "Card") {
    if (d.includes("Second Yellow")) return "Y2";
    if (d.includes("Red")) return "R";
    if (d.includes("Yellow")) return "Y";
  }
  return null;
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
        gte(matches.kickoff, new Date(nowMs - 8 * 60 * 60_000)), // full match + ET + late/nightly ratings back
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
      // Dedup by a STABLE key: the event's ordinal within its (team, category), in
      // chronological order — so the API later correcting a minute (which would
      // change a minute-based key) never re-notifies an already-sent event.
      const ord = new Map<string, number>();
      const sorted = [...events].sort(
        (a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.extraMinute ?? 0) - (b.extraMinute ?? 0),
      );
      for (const e of sorted) {
        const cat = eventCategory(e.type, e.detail);
        if (!cat) continue;
        const bucket = `${cat}:${e.teamId ?? 0}`;
        const n = (ord.get(bucket) ?? 0) + 1;
        ord.set(bucket, n);
        if (!e.player) continue; // never notify without the player's name — wait a tick
        const key = `${bucket}:${n}`;
        if (notified.has(key)) continue;
        const min = minuteLabel(e.minute, e.extraMinute);
        if (cat === "PM") await fire(key, "goal", `❌ Penalty manqué · ${e.player} ${min}`.trim());
        else if (cat === "G") {
          const og = e.detail === "Own Goal" ? " (csc)" : "";
          await fire(key, "goal", `⚽ ${score(m)} · ${e.player}${og} ${min}`.trim());
        } else if (cat === "Y2") await fire(key, "red", `🟥 Expulsion (2e jaune) · ${e.player} ${min}`.trim());
        else if (cat === "R") await fire(key, "red", `🟥 Carton rouge · ${e.player} ${min}`.trim());
        else if (cat === "Y") await fire(key, "yellow", `🟨 Carton jaune · ${e.player} ${min}`.trim());
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
