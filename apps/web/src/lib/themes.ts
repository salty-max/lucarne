import type { Theme } from "./prefs";

/** Selectable colour palettes. `swatch` holds the seven teletext colours as raw
 *  HSL triples (red, green, yellow, blue, magenta, cyan, white) — the SAME values
 *  as index.css, so the Settings preview matches the applied theme exactly. */
export const THEMES: { id: Theme; swatch: string[] }[] = [
  {
    id: "cept1",
    swatch: [
      "0 100% 50%",
      "120 100% 50%",
      "60 100% 50%",
      "240 100% 50%",
      "300 100% 50%",
      "180 100% 50%",
      "0 0% 100%",
    ],
  },
  {
    id: "neon",
    swatch: [
      "0 100% 64%",
      "145 100% 52%",
      "54 100% 52%",
      "225 100% 68%",
      "318 100% 68%",
      "180 100% 54%",
      "180 6% 92%",
    ],
  },
  {
    id: "amber",
    swatch: [
      "25 100% 58%",
      "45 100% 55%",
      "50 100% 62%",
      "36 45% 42%",
      "30 90% 55%",
      "44 100% 58%",
      "40 60% 82%",
    ],
  },
  {
    id: "green",
    swatch: [
      "128 100% 80%",
      "128 100% 55%",
      "128 100% 72%",
      "128 45% 44%",
      "128 70% 62%",
      "128 100% 68%",
      "128 55% 85%",
    ],
  },
];
