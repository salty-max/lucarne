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
  { comp: "ligue-1", broadcaster: "ligue-1-plus", coverage: "partial", note: "8 matchs sur 9" },
  { comp: "ligue-1", broadcaster: "amazon-prime", coverage: "partial", note: "Pass Ligue 1 — certaines affiches" },
  { comp: "ligue-2", broadcaster: "bein-sports", coverage: "full", note: "Intégralité de la Ligue 2 BKT" },
  { comp: "premier-league", broadcaster: "canal-plus", coverage: "full", note: "Exclusivité jusqu'en 2028" },
  { comp: "la-liga", broadcaster: "bein-sports", coverage: "full", note: "Jusqu'en 2027" },
  { comp: "bundesliga", broadcaster: "bein-sports", coverage: "full", note: "Jusqu'en 2029" },
  { comp: "champions-league", broadcaster: "canal-plus", coverage: "full", note: "Intégralité 2024-27" },
  { comp: "europa-league", broadcaster: "canal-plus", coverage: "full", note: "Jusqu'en 2027" },
  { comp: "conference-league", broadcaster: "canal-plus", coverage: "full", note: "Jusqu'en 2027" },
  // Nations League: M6 in clair for Les Bleus + beIN Sports for everything.
  { comp: "nations-league", broadcaster: "m6", coverage: "partial", note: "En clair — matchs de l'équipe de France" },
  { comp: "nations-league", broadcaster: "bein-sports", coverage: "full", note: "Intégralité de la Ligue des Nations" },
  // World Cup 2026: M6 in clair (France, semis, final) + beIN Sports (all 104).
  { comp: "world-cup", broadcaster: "m6", coverage: "partial", note: "En clair — France, demies & finale", from: "2026-06-11", to: "2026-07-19" },
  { comp: "world-cup", broadcaster: "bein-sports", coverage: "full", note: "Intégralité (104 matchs)", from: "2026-06-11", to: "2026-07-19" },
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
