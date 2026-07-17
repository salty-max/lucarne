/** Display labels for API-Football round names. The API gives English round
 *  strings ("Round of 16", "1st Qualifying Round", "Final") which read fine as
 *  is; we only tidy the numbered league rounds into "Matchday N". */
export function roundLabel(round: string | null | undefined): string {
  if (!round) return "";
  const m = round.match(/^(?:Regular Season|Group Stage|League Phase) - (\d+)$/);
  if (m) return `Matchday ${m[1]}`;
  return round;
}
