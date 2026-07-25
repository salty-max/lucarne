import { and, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matchEvents, matches, pushNotified, teams } from "@/db/schema";
import { chunkRows } from "@/lib/d1";
import type { NotifyMessage } from "@/lib/notify";
import { deliver, getVapid, type PushTrigger } from "@/lib/push";
import { devicesWatching, loadWatchState } from "@/lib/surveillance";

const KICKOFF_LEAD_MS = 11 * 60_000; // notify up to ~10 min before kickoff

/** How far into a match the "it's under way" push may still fire. Unlike the
 *  pre-match reminder this trigger is STATE-based (it fires on the first tick
 *  that sees the match live, so a missed tick — a deploy, a slow cron — just
 *  fires it a minute later), and this bound is what stops it announcing a
 *  kick-off to someone who started watching at the hour mark. */
const STARTED_MAX_ELAPSED = 15;
const STARTED_MAX_MS = 30 * 60_000; // fallback when the API hasn't sent `elapsed` yet

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
      elapsed: matches.elapsed,
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
    /** Send one notification, once. The dedup key is only burned when the push is
     *  actually OUT (or there was nobody to send it to): a push-service hiccup
     *  used to mark it notified regardless, losing the event for good instead of
     *  retrying it on the next tick. Retries are bounded by the match window of
     *  the query above, so a permanently failing endpoint can't be chased forever. */
    const fire = async (key: string, trigger: PushTrigger, message: NotifyMessage) => {
      if (notified.has(key)) return;
      fired++;
      // One tag PER EVENT: notifications sharing a tag replace each other in the
      // tray, so a single match-wide tag meant full-time was wiped out by the
      // man-of-the-match push, and the kick-off by the first goal.
      const r = await deliver(
        { title, message, matchId: m.id, tag: `m${m.id}:${key}` },
        { deviceIds: watchers, trigger },
      );
      sent += r.sent;
      if (r.sent > 0 || r.targets === 0) fresh.push(key);
    };

    // Lineups (~40 min out) + kickoff reminder.
    if (m.lineupsFetchedAt != null) await fire("LINEUPS", "lineups", { id: "lineups" });
    if (m.status === "scheduled" && m.kickoff.getTime() - nowMs <= KICKOFF_LEAD_MS && m.kickoff.getTime() > nowMs) {
      await fire("KO", "kickoff", { id: "kickoffSoon" });
    }

    // Phase transitions — each fires once.
    if (m.status === "live") {
      // The match is under way. Driven by the STATE (not by a pre-kickoff time
      // window like the reminder above), so it survives a missed tick: whatever
      // else happens, a watched match always announces its own kick-off.
      const started =
        m.elapsed != null ? m.elapsed <= STARTED_MAX_ELAPSED : nowMs - m.kickoff.getTime() <= STARTED_MAX_MS;
      if (started) await fire("START", "start", { id: "kickoff" });

      if (m.statusShort === "HT") await fire("HT", "ht", { id: "halfTime", score: score(m) });
      else if (m.statusShort === "ET" || m.statusShort === "BT") await fire("ET", "phase", { id: "extraTime" });
      else if (m.statusShort === "P") await fire("PENS", "phase", { id: "shootout" });
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
        const minute = minuteLabel(e.minute, e.extraMinute);
        const player = e.player;
        if (cat === "PM") await fire(key, "goal", { id: "penaltyMissed", player, minute });
        else if (cat === "G") {
          await fire(key, "goal", {
            id: "goal",
            score: score(m),
            player,
            minute,
            ownGoal: e.detail === "Own Goal",
          });
        } else if (cat === "Y2") await fire(key, "red", { id: "secondYellow", player, minute });
        else if (cat === "R") await fire(key, "red", { id: "red", player, minute });
        else if (cat === "Y") await fire(key, "yellow", { id: "yellow", player, minute });
      }

      // Substitutions — notify each exactly ONCE (keyed by team + outgoing player,
      // stable across minute corrections), batching those that first appear in the
      // same tick + minute into ONE multi-line notification: one sub per line,
      // team-labelled, in↑ / out↓ (assist = in, player = out). Live only, so
      // opening a finished match doesn't dump every sub.
      if (m.status === "live") {
        const subKey = (e: (typeof events)[number]) => `SUB:${e.teamId ?? 0}:${e.player ?? e.assist ?? ""}`;
        const teamOf = (e: (typeof events)[number]) =>
          e.teamId === m.homeId ? m.home : e.teamId === m.awayId ? m.away : "";
        const fresh2 = events
          .filter((e) => e.type === "subst" && (e.assist || e.player) && !notified.has(subKey(e)))
          .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.extraMinute ?? 0) - (b.extraMinute ?? 0));
        const groups = new Map<string, typeof fresh2>();
        for (const e of fresh2) {
          const gk = `${e.minute ?? 0}:${e.extraMinute ?? 0}`;
          const arr = groups.get(gk);
          if (arr) arr.push(e);
          else groups.set(gk, [e]);
        }
        for (const [, list] of groups) {
          const min = minuteLabel(list[0].minute, list[0].extraMinute);
          const lines = list.map((e) => {
            const io = [e.assist ? `${lastName(e.assist)} ↑` : "", e.player ? `${lastName(e.player)} ↓` : ""]
              .filter(Boolean)
              .join(" ");
            const team = teamOf(e);
            return team ? `${team} · ${io}` : io;
          });
          fired++;
          const r = await deliver(
            {
              title,
              message: { id: "subs", minute: min, lines },
              matchId: m.id,
              tag: `m${m.id}:SUBS:${min}`,
            },
            { deviceIds: watchers, trigger: "subst" },
          );
          sent += r.sent;
          if (r.sent > 0 || r.targets === 0) list.forEach((e) => fresh.push(subKey(e)));
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
      await fire("FT", "ft", { id: "fullTime", score: score(m), scorers: line });
    }

    // Man of the match — once the ratings resolved it.
    if (m.status === "finished" && m.motmName != null) {
      await fire("MOTM", "motm", { id: "motm", player: m.motmName, rating: m.motmRating });
    }

    // 2 columns per row — chunked like every other bulk write (D1 caps a
    // statement at 100 bound parameters).
    for (const part of chunkRows(fresh, 2)) {
      await db
        .insert(pushNotified)
        .values(part.map((key) => ({ matchId: m.id, key })))
        .onConflictDoNothing();
    }
  }

  return { sent, fired };
}
