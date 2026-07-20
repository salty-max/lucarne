import { Hono } from "hono";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { competitions, followedTeam, matches, pushSubscription, teams, watchedMatch } from "@/db/schema";
import { runSeed } from "@/db/seed-data";
import { authorizeCron } from "@/lib/auth";
import { COMPETITIONS } from "@/lib/competitions";
import { candidateKickoffRange } from "@/lib/live";
import { getCompetitionDetail } from "@/lib/competition";
import {
  runDetailsDrain,
  runFixtureSync,
  runFullResync,
  runLineupPoll,
  runLivePollTick,
} from "@/lib/poller";
import { recentRuns } from "@/lib/runlog";
import {
  ALL_TRIGGERS,
  isAllowedPushEndpoint,
  removeSubscription,
  saveSubscription,
  sendWelcome,
  vapidPublicKey,
  type PushTrigger,
} from "@/lib/push";
import { pickCache } from "@/lib/scheduleCache";
import { getMatchDetail, getSchedule, toWire, toWireMatchDetail } from "@/lib/schedule";
import { startOfParisDay } from "@/lib/time";
import type {
  CompetitionDetailResponse,
  CompetitionsResponse,
  LogsResponse,
  MatchDetailResponse,
  RunLogEntry,
  ScheduleResponse,
  TeamsResponse,
  WatchListResponse,
} from "@lucarne/shared";

// Portable Hono JSON API — runs on both the Node server and Cloudflare Workers.
// The React SPA (apps/web) is served separately by Static Assets / Node static.
export const app = new Hono();

// --- schedule grouped by Paris day. Query: ?from=YYYY-MM-DD&days=N&competition=slug
app.get("/api/schedule", async (c) => {
  try {
    const fromParam = c.req.query("from");
    const daysParam = c.req.query("days");
    const competition = c.req.query("competition") || undefined;
    // Paris midnight of `from` (noon avoids DST edges); defaults to today.
    const from = fromParam ? startOfParisDay(new Date(`${fromParam}T12:00:00Z`)) : undefined;
    const days = daysParam ? Number(daysParam) : undefined;
    const body: ScheduleResponse = {
      days: toWire(await getSchedule({ from, days, competition })),
    };
    return c.json(body);
  } catch (err) {
    console.error("[/api/schedule]", err);
    return c.json({ days: [] } satisfies ScheduleResponse);
  }
});

// --- one match by id, with detail-page extras (venue/round/timeline) ---
app.get("/api/match/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ match: null } satisfies MatchDetailResponse, 400);
    const m = await getMatchDetail(id);
    return c.json({ match: m ? toWireMatchDetail(m) : null } satisfies MatchDetailResponse);
  } catch (err) {
    console.error("[/api/match]", err);
    return c.json({ match: null } satisfies MatchDetailResponse);
  }
});

// --- the tracked competitions (for the Competitions view / nav) ---
app.get("/api/competitions", async (c) => {
  try {
    const rows = await db
      .select({
        slug: competitions.slug,
        name: competitions.name,
        type: competitions.type,
        country: competitions.country,
      })
      .from(competitions)
      .orderBy(asc(competitions.id));
    // Present them in the catalogue's order (so Ligue 2 sits next to Ligue 1),
    // not DB-insertion order.
    const order = new Map(COMPETITIONS.map((cc, i) => [cc.slug, i]));
    rows.sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
    return c.json({ competitions: rows } satisfies CompetitionsResponse);
  } catch (err) {
    console.error("[/api/competitions]", err);
    return c.json({ competitions: [] } satisfies CompetitionsResponse);
  }
});

// --- one competition's tables + knockout bracket (for the Competition view) ---
app.get("/api/competition/:slug", async (c) => {
  try {
    const competition = await getCompetitionDetail(c.req.param("slug"));
    return c.json({ competition } satisfies CompetitionDetailResponse);
  } catch (err) {
    console.error("[/api/competition]", err);
    return c.json({ competition: null } satisfies CompetitionDetailResponse);
  }
});

// --- live scores JSON: read from OUR db, polled by the browser (no API cost) ---
app.get("/api/live", async (c) => {
  try {
    const { earliest, latest } = candidateKickoffRange(Date.now());
    const rows = await db
      .select({
        id: matches.id,
        status: matches.status,
        elapsed: matches.elapsed,
        homeGoals: matches.homeGoals,
        awayGoals: matches.awayGoals,
        homePenalties: matches.homePenalties,
        awayPenalties: matches.awayPenalties,
      })
      .from(matches)
      .where(
        and(
          gte(matches.kickoff, earliest),
          lte(matches.kickoff, latest),
          inArray(matches.status, ["live", "finished"]),
        ),
      );
    return c.json({ matches: rows });
  } catch (err) {
    console.error("[/api/live]", err);
    return c.json({ matches: [] });
  }
});

// All known teams (name + short name), for the "My teams" follow picker.
app.get("/api/teams", async (c) => {
  try {
    const rows = await db
      .select({ name: teams.name, shortName: teams.shortName })
      .from(teams)
      .orderBy(asc(teams.name));
    return c.json({ teams: rows } satisfies TeamsResponse);
  } catch (err) {
    console.error("[/api/teams]", err);
    return c.json({ teams: [] } satisfies TeamsResponse, 500);
  }
});

// --- Web Push: the client fetches the VAPID public key, then registers /
//     deregisters its browser subscription (with the teams it wants alerts for). ---
app.get("/api/push/key", (c) => {
  const key = vapidPublicKey();
  return key ? c.json({ key }) : c.json({ key: null }, 503);
});

app.post("/api/push/subscribe", async (c) => {
  try {
    const body = (await c.req.json()) as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      deviceId?: unknown;
      triggers?: unknown;
      welcome?: boolean;
    };
    const sub = body.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return c.json({ ok: false, error: "bad subscription" }, 400);
    }
    // Only real push services — see isAllowedPushEndpoint.
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      return c.json({ ok: false, error: "unsupported push endpoint" }, 400);
    }
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.trim() ? body.deviceId.trim() : null;
    const triggers = Array.isArray(body.triggers)
      ? body.triggers.filter((t): t is PushTrigger => (ALL_TRIGGERS as string[]).includes(t as string))
      : ALL_TRIGGERS;
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    await saveSubscription(pushSub, deviceId, triggers);
    if (body.welcome) await sendWelcome(pushSub);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/push/subscribe]", err);
    return c.json({ ok: false }, 500);
  }
});

app.post("/api/push/unsubscribe", async (c) => {
  try {
    const body = (await c.req.json()) as { endpoint?: string };
    if (body.endpoint) await removeSubscription(body.endpoint);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/push/unsubscribe]", err);
    return c.json({ ok: false }, 500);
  }
});

// --- active surveillance ("radar"): a device marks which matches it wants live-
//     enriched (+ later, notified). Keyed by an anonymous client deviceId, so it
//     works without push permission. The per-minute enrichment reads these. ---
function watchKey(
  body: { deviceId?: unknown; matchId?: unknown; state?: unknown },
): { deviceId: string; matchId: number; state: "on" | "off" } | null {
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const matchId = typeof body.matchId === "number" ? body.matchId : Number(body.matchId);
  const state = body.state === "off" ? "off" : "on"; // default "on"
  if (!deviceId || deviceId.length > 100 || !Number.isInteger(matchId) || matchId <= 0) return null;
  return { deviceId, matchId, state };
}

// Set this device's decision for a match: state "on" = watch, "off" = mute (which
// overrides the followed-team auto-surveillance). Upserts, so re-toggling flips it.
app.post("/api/watch", async (c) => {
  try {
    const v = watchKey(await c.req.json());
    if (!v) return c.json({ ok: false }, 400);
    // Same reasoning as the followed-teams cap: unauthenticated by design, and
    // these rows are re-read every tick. Nobody legitimately watches hundreds.
    const [{ n = 0 } = {}] = await db
      .select({ n: sql<number>`count(*)` })
      .from(watchedMatch)
      .where(eq(watchedMatch.deviceId, v.deviceId));
    if (n >= MAX_WATCHED_MATCHES) return c.json({ ok: false, error: "too many" }, 429);
    await db
      .insert(watchedMatch)
      .values(v)
      .onConflictDoUpdate({
        target: [watchedMatch.deviceId, watchedMatch.matchId],
        set: { state: v.state },
      });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/watch POST]", err);
    return c.json({ ok: false }, 500);
  }
});

// Clear this device's decision (revert to default: auto-surveilled iff a followed
// team plays). The UI uses this to un-mute or un-watch back to neutral.
app.delete("/api/watch", async (c) => {
  try {
    const v = watchKey(await c.req.json());
    if (!v) return c.json({ ok: false }, 400);
    await db
      .delete(watchedMatch)
      .where(and(eq(watchedMatch.deviceId, v.deviceId), eq(watchedMatch.matchId, v.matchId)));
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/watch DELETE]", err);
    return c.json({ ok: false }, 500);
  }
});

// This device's explicit on/off decisions, so the UI can resolve each toggle
// (combined with the client's followed teams for the auto default).
app.get("/api/watch", async (c) => {
  const empty: WatchListResponse = { on: [], off: [] };
  try {
    const deviceId = (c.req.query("deviceId") ?? "").trim();
    if (!deviceId) return c.json(empty);
    const rows = await db
      .select({ matchId: watchedMatch.matchId, state: watchedMatch.state })
      .from(watchedMatch)
      .where(eq(watchedMatch.deviceId, deviceId));
    return c.json({
      on: rows.filter((r) => r.state === "on").map((r) => r.matchId),
      off: rows.filter((r) => r.state === "off").map((r) => r.matchId),
    } satisfies WatchListResponse);
  } catch (err) {
    console.error("[/api/watch GET]", err);
    return c.json(empty, 500);
  }
});

// --- GDPR: everything we hold for a device is keyed by its anonymous deviceId,
//     so "forget me" is a single call. Surfaced in Settings. ---
app.delete("/api/device", async (c) => {
  try {
    const deviceId = (c.req.query("deviceId") ?? "").trim();
    if (!deviceId || deviceId.length > 100) return c.json({ ok: false }, 400);
    await db.delete(watchedMatch).where(eq(watchedMatch.deviceId, deviceId));
    await db.delete(followedTeam).where(eq(followedTeam.deviceId, deviceId));
    await db.delete(pushSubscription).where(eq(pushSubscription.deviceId, deviceId));
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/device DELETE]", err);
    return c.json({ ok: false }, 500);
  }
});

/** No real user follows more than a handful; the cap is purely an abuse bound. */
const MAX_FOLLOWED_TEAMS = 50;
/** Likewise: settled matches are purged, so a real device never accumulates many. */
const MAX_WATCHED_MATCHES = 200;

// --- followed teams: the server-side mirror of the client's favourites, per
//     device. Drives auto-surveillance (enrich + push) independently of push. ---
app.put("/api/follows", async (c) => {
  try {
    const body = (await c.req.json()) as { deviceId?: unknown; teams?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId || deviceId.length > 100) return c.json({ ok: false }, 400);
    // Capped: this endpoint is unauthenticated by design (no accounts), and the
    // rows it writes are re-read on every tick, so an unbounded array is a cheap
    // way to bloat the table and slow the whole cadence down.
    const teamList = Array.isArray(body.teams)
      ? [
          ...new Set(
            body.teams.filter((t): t is string => typeof t === "string" && t.trim().length > 0),
          ),
        ].slice(0, MAX_FOLLOWED_TEAMS)
      : [];
    await db.delete(followedTeam).where(eq(followedTeam.deviceId, deviceId));
    if (teamList.length > 0) {
      await db
        .insert(followedTeam)
        .values(teamList.map((team) => ({ deviceId, team })))
        .onConflictDoNothing();
    }
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/follows PUT]", err);
    return c.json({ ok: false }, 500);
  }
});

// --- cron endpoints (authed). Optional: only needed for serverless deploys or
//     manual triggering. The Node in-process scheduler calls the same logic. ---
app.get("/api/cron/fixtures", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runFixtureSync(pickCache(c.env))) });
  } catch (err) {
    console.error("[cron/fixtures]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/live", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json(await runLivePollTick(new Date(), pickCache(c.env)));
  } catch (err) {
    console.error("[cron/live]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/lineups", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runLineupPoll()) });
  } catch (err) {
    console.error("[cron/lineups]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/details", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runDetailsDrain()) });
  } catch (err) {
    console.error("[cron/details]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Recent scheduled-job history (newest first) from run_log — the queryable cron
// audit trail behind the P800 logs page. Read-only, so public like the other
// read endpoints (no side effects, no secrets — detail is job counts + errors).
// `?limit=N` (default 100, capped at 200).
// Ops endpoint: it exposes the cron cadence, the remaining API budget and raw
// error strings, so it's authed like the other /api/cron/* routes.
app.get("/api/logs", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 100));
    const runs: RunLogEntry[] = (await recentRuns(limit)).map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      job: r.job,
      ok: r.ok,
      detail: r.detail,
      ms: r.ms,
    }));
    return c.json({ ok: true, runs } satisfies LogsResponse);
  } catch (err) {
    console.error("[logs]", err);
    return c.json({ ok: false, runs: [] } satisfies LogsResponse, 500);
  }
});

// Force the weekly full-season fixture re-sync on demand (also usable to pull a
// competition's whole calendar after a draw). Standings ride the daily sync.
app.get("/api/cron/resync", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runFullResync(pickCache(c.env))) });
  } catch (err) {
    console.error("[cron/resync]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Idempotent reference-data seed (broadcasters/competitions/rules). Authed —
// run once after a D1 deploy, or again after updating the seed each season.
app.post("/api/admin/seed", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runSeed(db)) });
  } catch (err) {
    console.error("[admin/seed]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// One-time backfill of post-match details across the FULL backlog (not just the
// last few days). Budget-gated + subrequest-capped, so call repeatedly until
// `matches` comes back 0 — useful after seeding a whole tournament's history.
app.post("/api/admin/backfill-details", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runDetailsDrain(50, { sinceMs: null })) });
  } catch (err) {
    console.error("[admin/backfill-details]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});
