import type { DB } from "@/db";
import { broadcasters, broadcastRules, competitions } from "@/db/schema";
import { COMPETITIONS } from "@/lib/competitions";

// French TV rights for the 2025-26 season (see README for sources).
const BROADCASTERS = [
  { slug: "ligue-1-plus", name: "Ligue 1+", color: "#DC2626" },
  { slug: "amazon-prime", name: "Amazon Prime Video", color: "#0EA5E9" },
  { slug: "canal-plus", name: "CANAL+", color: "#4F46E5" },
  { slug: "bein-sports", name: "beIN SPORTS", color: "#DB2777" },
  { slug: "m6", name: "M6", color: "#14B8A6" },
  { slug: "youtube", name: "YouTube", color: "#FF0000" },
];

// Default validity spans the 2025-26 and 2026-27 club seasons; rules can
// override per entry. (Most French/foreign rights deals run multi-year.)
const VALID_FROM = "2025-07-01";
const VALID_TO = "2027-06-30";

const RULES: {
  comp: string;
  broadcaster: string;
  coverage: "full" | "partial";
  note: string | null;
  from?: string;
  to?: string;
}[] = [
  // Ligue 1 = split rights → two partial rules; refine per match via overrides.
  { comp: "ligue-1", broadcaster: "ligue-1-plus", coverage: "partial", note: "8 of 9 matches" },
  { comp: "ligue-1", broadcaster: "amazon-prime", coverage: "partial", note: "Ligue 1 Pass — selected fixtures" },
  { comp: "ligue-2", broadcaster: "bein-sports", coverage: "full", note: "All of Ligue 2 BKT" },
  { comp: "premier-league", broadcaster: "canal-plus", coverage: "full", note: "Exclusive until 2028" },
  { comp: "la-liga", broadcaster: "bein-sports", coverage: "full", note: "Until 2027" },
  { comp: "bundesliga", broadcaster: "bein-sports", coverage: "full", note: "Until 2029" },
  { comp: "champions-league", broadcaster: "canal-plus", coverage: "full", note: "All matches 2024–27" },
  { comp: "europa-league", broadcaster: "canal-plus", coverage: "full", note: "Until 2027" },
  { comp: "conference-league", broadcaster: "canal-plus", coverage: "full", note: "Until 2027" },
  // Nations League: M6 free-to-air for France + beIN Sports for everything.
  { comp: "nations-league", broadcaster: "m6", coverage: "partial", note: "Free-to-air — France matches" },
  { comp: "nations-league", broadcaster: "bein-sports", coverage: "full", note: "All of the Nations League" },
  // World Cup 2026: M6 free-to-air (France, semis, final) + beIN Sports (all 104).
  { comp: "world-cup", broadcaster: "m6", coverage: "partial", note: "Free-to-air — France, semis & final", from: "2026-06-11", to: "2026-07-19" },
  { comp: "world-cup", broadcaster: "bein-sports", coverage: "full", note: "All 104 matches", from: "2026-06-11", to: "2026-07-19" },
  // J1: no traditional French rights holder, so J.League International streams it
  // free on YouTube (up to 4 matches/week, geo-open where there's no broadcaster).
  // J2/J3 are NOT on that channel (J1-only) — left without a broadcaster.
  { comp: "j1-league", broadcaster: "youtube", coverage: "partial", note: "J.League International — free, up to 4 matches/week" },
];

export type SeedResult = { broadcasters: number; competitions: number; rules: number };

/**
 * Idempotent reference-data seed. Works on any bound db (bun:sqlite locally,
 * D1 in prod), so the CLI (`bun run db:seed`) and the authed
 * `POST /api/admin/seed` endpoint share this exact logic.
 */
export async function runSeed(db: DB): Promise<SeedResult> {
  for (const b of BROADCASTERS) {
    await db
      .insert(broadcasters)
      .values(b)
      .onConflictDoUpdate({ target: broadcasters.slug, set: { name: b.name, color: b.color } });
  }

  for (const c of COMPETITIONS) {
    await db
      .insert(competitions)
      .values({
        slug: c.slug,
        name: c.name,
        apiFootballId: c.apiFootballId,
        country: c.country,
        type: c.type,
      })
      .onConflictDoUpdate({
        target: competitions.slug,
        set: { name: c.name, apiFootballId: c.apiFootballId, country: c.country, type: c.type },
      });
  }

  // Rules are authoritative — replace them wholesale.
  const bRows = await db.select().from(broadcasters);
  const cRows = await db.select().from(competitions);
  const bBySlug = new Map(bRows.map((b) => [b.slug, b.id]));
  const cBySlug = new Map(cRows.map((c) => [c.slug, c.id]));

  await db.delete(broadcastRules);
  for (const r of RULES) {
    const competitionId = cBySlug.get(r.comp);
    const broadcasterId = bBySlug.get(r.broadcaster);
    if (!competitionId || !broadcasterId) {
      throw new Error(`Seed mapping error: ${r.comp} / ${r.broadcaster}`);
    }
    await db.insert(broadcastRules).values({
      competitionId,
      broadcasterId,
      validFrom: r.from ?? VALID_FROM,
      validTo: r.to ?? VALID_TO,
      coverage: r.coverage,
      note: r.note,
    });
  }

  return { broadcasters: BROADCASTERS.length, competitions: COMPETITIONS.length, rules: RULES.length };
}
