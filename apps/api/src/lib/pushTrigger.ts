import { and, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matchEvents, matches, pushNotified, pushSubscription, teams } from "@/db/schema";
import { deliver, getVapid, type PushPayload, type PushTrigger } from "@/lib/push";

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

/**
 * Scan the matches around now that involve a followed team, and push their new
 * events (goals, cards), imminent kickoffs and full-times — each exactly once
 * (deduped via `push_notified`). Meant to run on the live cadence, after enrich.
 */
export async function runPushNotify(now = new Date()): Promise<{ sent: number; fired: number }> {
  if (!getVapid()) return { sent: 0, fired: 0 };

  // Union of every followed team; if nobody follows anything, there's no work.
  const subs = await db.select({ teams: pushSubscription.teams }).from(pushSubscription);
  const followed = new Set<string>();
  for (const s of subs) for (const t of s.teams) followed.add(t);
  if (followed.size === 0) return { sent: 0, fired: 0 };

  const nowMs = now.getTime();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const rows = await db
    .select({
      id: matches.id,
      status: matches.status,
      kickoff: matches.kickoff,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homeId: matches.homeTeamId,
      awayId: matches.awayTeamId,
      home: home.name,
      away: away.name,
      lineupsFetchedAt: matches.lineupsFetchedAt,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(
      and(
        gte(matches.kickoff, new Date(nowMs - 3 * 60 * 60_000)), // covers a full match back
        lte(matches.kickoff, new Date(nowMs + 60 * 60_000)), // pre-match (lineups ~40 min out)
      ),
    );

  const relevant = rows.filter((m) => followed.has(m.home) || followed.has(m.away));
  if (relevant.length === 0) return { sent: 0, fired: 0 };

  let sent = 0;
  let fired = 0;
  const score = (m: (typeof relevant)[number]) => `${m.homeGoals ?? 0}–${m.awayGoals ?? 0}`;

  for (const m of relevant) {
    const teamsForMatch = [m.home, m.away];
    const notified = new Set(
      (await db.select({ key: pushNotified.key }).from(pushNotified).where(eq(pushNotified.matchId, m.id))).map(
        (r) => r.key,
      ),
    );
    const fresh: string[] = [];
    const fire = async (key: string, trigger: PushTrigger, payload: Omit<PushPayload, "matchId" | "tag">) => {
      if (notified.has(key)) return;
      fresh.push(key);
      fired++;
      sent += await deliver({ ...payload, matchId: m.id, tag: `match-${m.id}` }, { teams: teamsForMatch, trigger });
    };

    // Lineups published (~40 min out) — once the XI is confirmed.
    if (m.lineupsFetchedAt != null) {
      await fire("LINEUPS", "lineups", { title: `${m.home} – ${m.away}`, body: "Compositions disponibles" });
    }

    // Kickoff reminder — a scheduled match starting within the lead window.
    if (m.status === "scheduled" && m.kickoff.getTime() - nowMs <= KICKOFF_LEAD_MS && m.kickoff.getTime() > nowMs) {
      await fire("KO", "kickoff", { title: `${m.home} – ${m.away}`, body: "Coup d'envoi imminent" });
    }

    // Goals + cards — only for in-play / finished matches.
    if (m.status === "live" || m.status === "finished") {
      const events = await db
        .select()
        .from(matchEvents)
        .where(eq(matchEvents.matchId, m.id));
      for (const e of events) {
        const key = eventKey(e);
        if (notified.has(key)) continue;
        const min = minuteLabel(e.minute, e.extraMinute);
        const teamName = e.teamId === m.homeId ? m.home : e.teamId === m.awayId ? m.away : "";
        if (e.type === "Goal" && e.detail !== "Missed Penalty") {
          await fire(key, "goal", {
            title: `⚽ ${m.home} ${score(m)} ${m.away}`,
            body: `${e.player ?? teamName} ${min}`.trim(),
          });
        } else if (e.type === "Card" && (e.detail ?? "").includes("Red")) {
          await fire(key, "red", {
            title: `${m.home} – ${m.away}`,
            body: `🟥 Carton rouge — ${e.player ?? teamName} ${min}`.trim(),
          });
        } else if (e.type === "Card" && (e.detail ?? "").includes("Yellow")) {
          await fire(key, "yellow", {
            title: `${m.home} – ${m.away}`,
            body: `🟨 Carton jaune — ${e.player ?? teamName} ${min}`.trim(),
          });
        }
      }
    }

    // Full-time.
    if (m.status === "finished") {
      await fire("FT", "ft", { title: `${m.home} ${score(m)} ${m.away}`, body: "Fin du match" });
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
