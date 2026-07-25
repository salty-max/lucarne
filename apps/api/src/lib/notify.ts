/**
 * Notification copy, per language.
 *
 * Push bodies are written on the SERVER, minutes or hours after the browser that
 * will display them last spoke to us — so we can't just send whatever the UI
 * happens to be showing. Instead the trigger emits a language-neutral
 * DESCRIPTOR of what happened, and the delivery step renders it once per
 * recipient, in the language that device stored with its subscription.
 *
 * Scores, player names and minutes are already language-neutral, so only the
 * event labels live here.
 */

/** The languages the UI offers (mirrors the web's `Lang`). */
export type NotifyLang = "en" | "fr";
export const DEFAULT_NOTIFY_LANG: NotifyLang = "fr"; // the web's default too

/** Narrow untrusted input (a subscribe payload, a legacy NULL column). */
export function asNotifyLang(v: unknown): NotifyLang | null {
  return v === "en" || v === "fr" ? v : null;
}

/** What happened, before it's been put into words. */
export type NotifyMessage =
  | { id: "lineups" }
  | { id: "kickoffSoon" }
  | { id: "kickoff" }
  | { id: "halfTime"; score: string }
  | { id: "extraTime" }
  | { id: "shootout" }
  | { id: "goal"; score: string; player: string; minute: string; ownGoal: boolean }
  | { id: "penaltyMissed"; player: string; minute: string }
  | { id: "yellow"; player: string; minute: string }
  | { id: "red"; player: string; minute: string }
  | { id: "secondYellow"; player: string; minute: string }
  | { id: "subs"; minute: string; lines: string[] }
  | { id: "fullTime"; score: string; scorers: string }
  | { id: "motm"; player: string; rating: number | null }
  | { id: "welcome" };

/** Render a notification body in `lang`. */
export function renderNotify(m: NotifyMessage, lang: NotifyLang): string {
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
  switch (m.id) {
    case "lineups":
      return t("Line-ups are out", "Compositions disponibles");
    case "kickoffSoon":
      return t("⏰ Kicking off shortly", "⏰ Coup d'envoi imminent");
    case "kickoff":
      return t("🟢 Kick-off", "🟢 Coup d'envoi");
    case "halfTime":
      return `⏸ ${t("Half-time", "Mi-temps")} · ${m.score}`;
    case "extraTime":
      return t("⏱ Extra time", "⏱ Prolongations");
    case "shootout":
      return t("🥅 Penalty shootout", "🥅 Séance de tirs au but");
    case "goal":
      return `⚽ ${m.score} · ${m.player}${m.ownGoal ? t(" (og)", " (csc)") : ""} ${m.minute}`.trim();
    case "penaltyMissed":
      return `❌ ${t("Penalty missed", "Penalty manqué")} · ${m.player} ${m.minute}`.trim();
    case "yellow":
      return `🟨 ${t("Yellow card", "Carton jaune")} · ${m.player} ${m.minute}`.trim();
    case "red":
      return `🟥 ${t("Red card", "Carton rouge")} · ${m.player} ${m.minute}`.trim();
    case "secondYellow":
      return `🟥 ${t("Sent off (second yellow)", "Expulsion (2e jaune)")} · ${m.player} ${m.minute}`.trim();
    case "subs":
      // Player names and the in↑/out↓ arrows carry this one — nothing to translate.
      return `🔄 ${m.minute}\n${m.lines.join("\n")}`;
    case "fullTime":
      return `⏱ ${t("Full time", "Fin")} · ${m.score}${m.scorers ? ` · ${m.scorers}` : ""}`;
    case "motm":
      return `⭐ ${t("Man of the match", "Homme du match")} · ${m.player}${m.rating != null ? ` (${m.rating})` : ""}`;
    case "welcome":
      return t("Notifications enabled ✓", "Notifications activées ✓");
  }
}
