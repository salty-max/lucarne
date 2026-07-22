import type { Lang } from "./settings";

/** API-Football round names. English rounds read fine as-is; French gets full
 *  translations. Numbered league rounds become "Matchday N" / "Journée N". */
export function roundLabel(round: string | null | undefined, lang: Lang): string {
  if (!round) return "";
  const md = round.match(/^(?:Regular Season|Group Stage|League Phase) - (\d+)$/);
  if (md) return lang === "fr" ? `Journée ${md[1]}` : `Matchday ${md[1]}`;
  if (lang !== "fr") return round;

  const KNOCKOUT: Record<string, string> = {
    "Round of 32": "16es de finale",
    "Round of 16": "8es de finale",
    "Quarter-finals": "Quarts de finale",
    "Semi-finals": "Demi-finales",
    "3rd Place Final": "Petite finale",
    Final: "Finale",
    "Play-offs": "Barrages",
    "Play-off Round": "Barrages",
    "Knockout Round Play-offs": "Barrages",
  };
  if (KNOCKOUT[round]) return KNOCKOUT[round];
  const q = round.match(/^(\d+)(?:st|nd|rd|th) Qualifying Round$/);
  if (q) return `${q[1] === "1" ? "1er" : `${q[1]}e`} tour de qualif.`;
  const g = round.match(/^Group ([A-Z0-9]+)$/);
  if (g) return `Groupe ${g[1]}`;
  return round;
}

const COMPETITION_FR: Record<string, string> = {
  "World Cup": "Coupe du Monde",
  "Champions League": "Ligue des Champions",
  "Europa League": "Ligue Europa",
  "Conference League": "Ligue Conférence",
  "Nations League": "Ligue des Nations",
};

/** Competition name — French for the ones FR media translates (leagues like
 *  Premier League / La Liga / Bundesliga / Ligue 1 keep their brand name). */
export function competitionLabel(name: string, lang: Lang): string {
  return lang === "fr" ? (COMPETITION_FR[name] ?? name) : name;
}

const COUNTRY_FR: Record<string, string> = {
  France: "France",
  England: "Angleterre",
  Spain: "Espagne",
  Germany: "Allemagne",
  Italy: "Italie",
  Japan: "Japon",
  Europe: "Europe",
  World: "Monde",
};

/** Competition country name — French for the known set, else unchanged. */
export function countryLabel(country: string | null | undefined, lang: Lang): string {
  if (!country) return "";
  return lang === "fr" ? (COUNTRY_FR[country] ?? country) : country;
}

const NOTE_FR: Record<string, string> = {
  "8 of 9 matches": "8 matchs sur 9",
  "Ligue 1 Pass — selected fixtures": "Pass Ligue 1 — certaines affiches",
  "All of Ligue 2 BKT": "Intégralité de la Ligue 2 BKT",
  "Exclusive until 2028": "Exclusivité jusqu'en 2028",
  "Until 2027": "Jusqu'en 2027",
  "Until 2029": "Jusqu'en 2029",
  "All matches 2024–27": "Intégralité 2024–27",
  "Free-to-air — France matches": "En clair — matchs de l'équipe de France",
  "All of the Nations League": "Intégralité de la Ligue des Nations",
  "Free-to-air — France, semis & final": "En clair — France, demies & finale",
  "All 104 matches": "Intégralité des 104 matchs",
};

/** Broadcaster coverage note — French for the seeded set, else unchanged. */
export function noteLabel(note: string | null | undefined, lang: Lang): string {
  if (!note) return "";
  return lang === "fr" ? (NOTE_FR[note] ?? note) : note;
}
