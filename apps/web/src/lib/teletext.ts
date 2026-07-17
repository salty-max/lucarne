import type { CompetitionInfo } from "@lucarne/shared";

/** Teletext page numbering. Static sections get round numbers; each tracked
 *  competition gets 410, 411, … so it's reachable by typing its number. */
const STATIC: Record<string, string> = {
  "/": "100",
  "/calendar": "300",
  "/competitions": "400",
  "/broadcasters": "600",
};
const NO_TO_PATH: Record<string, string> = Object.fromEntries(
  Object.entries(STATIC).map(([path, no]) => [no, path]),
);
const COMP_BASE = 410;

/** The four colour "FastText" keys (R/G/Y/C) and the sections they jump to.
 *  Keys track the UI language's colour initials (red/green/yellow/cyan). */
export const FASTTEXT = [
  { key: "r", cls: "f-red", no: "100", label: "Live", to: "/" },
  { key: "g", cls: "f-grn", no: "300", label: "Calendar", to: "/calendar" },
  { key: "y", cls: "f-yel", no: "400", label: "Competitions", to: "/competitions" },
  { key: "c", cls: "f-cyn", no: "600", label: "Broadcasters", to: "/broadcasters" },
] as const;

/** Ordered sections for ◄ ► paging. */
export const PAGE_ORDER = ["/", "/calendar", "/competitions", "/broadcasters"];

/** Which ordered section a path belongs to (match/competition fold into their base). */
export function sectionOf(path: string): string {
  if (path.startsWith("/calendar")) return "/calendar";
  if (path.startsWith("/competitions")) return "/competitions";
  if (path.startsWith("/broadcasters")) return "/broadcasters";
  return "/";
}

export function compPageNo(index: number): string {
  return String(COMP_BASE + index);
}

/** The page number shown for the current route. */
export function pageNoForPath(path: string, comps: CompetitionInfo[] | null): string {
  if (STATIC[path]) return STATIC[path];
  if (path.startsWith("/competitions/")) {
    const slug = path.split("/")[2];
    const i = (comps ?? []).findIndex((c) => c.slug === slug);
    return i >= 0 ? compPageNo(i) : "400";
  }
  if (path.startsWith("/match/")) return "500";
  return "100";
}

/** Resolve a typed 3-digit page number to a route, or null if unassigned. */
export function routeForPageNo(no: string, comps: CompetitionInfo[] | null): string | null {
  if (NO_TO_PATH[no]) return NO_TO_PATH[no];
  const n = Number(no);
  const list = comps ?? [];
  if (n >= COMP_BASE && n < COMP_BASE + list.length) {
    return `/competitions/${list[n - COMP_BASE].slug}`;
  }
  return null;
}
