export type TtColor = "red" | "green" | "yellow" | "cyan" | "magenta";

/** Hue (0–360) of a `#rrggbb` colour, or -1 if it can't be parsed. */
function hueOf(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length < 6) return -1;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  if ([r, g, b].some(Number.isNaN)) return -1;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// Teletext hue anchors. Blue is folded into cyan (pure blue is too dark for the
// dark-on-colour chip text) and white is reserved, so a channel always lands on
// one of five readable, on-palette colours.
const ANCHORS: [TtColor, number][] = [
  ["red", 0],
  ["yellow", 55],
  ["green", 120],
  ["cyan", 190],
  ["magenta", 310],
];

/** Map a broadcaster's brand hex to the nearest teletext palette colour, so its
 *  chip stays on-theme in every palette (rendered via `hsl(var(--tt-<name>))`). */
export function channelTt(hex: string): TtColor {
  const h = hueOf(hex);
  if (h < 0) return "cyan";
  let best: TtColor = "cyan";
  let bestD = 360;
  for (const [name, centre] of ANCHORS) {
    const raw = Math.abs(h - centre);
    const d = Math.min(raw, 360 - raw);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
