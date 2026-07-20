/** The teletext palette: eight colours, full saturation, nothing in between.
 *  These are the CEPT values the web app's `cept1` theme uses, so both clients
 *  render the same red. */
export const TT = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
} as const;

export type Colour = (typeof TT)[keyof typeof TT];

/** Index-aligned with TT, so a Colour indexes straight into these. */
const RGB: readonly [number, number, number][] = [
  [0, 0, 0], // black
  [255, 0, 0], // red
  [0, 255, 0], // green
  [255, 255, 0], // yellow
  [0, 0, 255], // blue
  [255, 0, 255], // magenta
  [0, 255, 255], // cyan
  [255, 255, 255], // white
];

/** Truecolor where we can get it: the basic ANSI 30-37 are theme-dependent, and
 *  a "teletext red" that renders maroon defeats the point. Falls back rather
 *  than assuming, and honours NO_COLOR. */
function detectMode(): "truecolor" | "ansi" | "none" {
  const env = process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (env.LUCARNE_COLOR === "ansi") return "ansi";
  if (env.LUCARNE_COLOR === "none") return "none";
  const ct = env.COLORTERM ?? "";
  if (ct.includes("truecolor") || ct.includes("24bit")) return "truecolor";
  if ((env.TERM ?? "").includes("256color")) return "truecolor";
  return "ansi";
}

export const mode = detectMode();

export function fg(c: Colour): string {
  if (mode === "none") return "";
  if (mode === "ansi") return `\x1b[${90 + c}m`; // bright: closer to full-intensity teletext
  const [r, g, b] = RGB[c]!;
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bg(c: Colour): string {
  if (mode === "none") return "";
  if (mode === "ansi") return `\x1b[${100 + c}m`;
  const [r, g, b] = RGB[c]!;
  return `\x1b[48;2;${r};${g};${b}m`;
}

export const RESET = "\x1b[0m";

/** Teletext has no notion of "dim" — the closest thing to de-emphasis is
 *  choosing a quieter colour, so callers pick cyan/blue rather than a modifier. */
export const NAMES: Record<string, Colour> = {
  black: TT.black,
  red: TT.red,
  green: TT.green,
  yellow: TT.yellow,
  blue: TT.blue,
  magenta: TT.magenta,
  cyan: TT.cyan,
  white: TT.white,
};
