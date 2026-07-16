import { TEAM_LOGO_SLUGS } from "./teamLogos";

// Competitions with a bundled SVG crest (public/logos/competitions). The World
// Cup has none in the set → falls back to no logo.
const COMPETITION_LOGO_SLUGS = new Set([
  "premier-league",
  "ligue-1",
  "la-liga",
  "bundesliga",
  "champions-league",
  "europa-league",
  "conference-league",
  "world-cup",
]);

export function competitionLogo(slug: string): string | null {
  return COMPETITION_LOGO_SLUGS.has(slug) ? `/logos/competitions/${slug}.svg` : null;
}

/** Normalize a team name to the bundled-logo slug (football-logos.cc style). */
export function teamSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// API names that don't slugify to the bundled national-team filename.
const NATIONAL_TEAM_ALIASES: Record<string, string> = {
  "cape-verde-islands": "cabo-verde-national-team",
  "cape-verde": "cabo-verde-national-team",
  "ivory-coast": "cote-d-ivoire-national-team",
  "dr-congo": "congo-dr-national-team",
  netherlands: "dutch-national-team",
  portugal: "portuguese-football-federation",
  turkiye: "turkey-national-team",
  czechia: "czech-republic-national-team",
  "bosnia-herzegovina": "bosnia-and-herzegovina-national-team",
  "united-states": "usa-national-team",
};

/** Bundled team crest src if we have one, else null (→ fall back to API logo). */
export function teamLogo(name: string): string | null {
  const slug = teamSlug(name);
  if (TEAM_LOGO_SLUGS.has(slug)) return `/logos/teams/${slug}.png`;
  // National teams are stored as "<country>-national-team".
  const national = `${slug}-national-team`;
  if (TEAM_LOGO_SLUGS.has(national)) return `/logos/teams/${national}.png`;
  const alias = NATIONAL_TEAM_ALIASES[slug];
  if (alias && TEAM_LOGO_SLUGS.has(alias)) return `/logos/teams/${alias}.png`;
  return null;
}
