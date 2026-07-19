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
    id: "gray",
    swatch: [
      "0 0% 100%",
      "0 0% 80%",
      "0 0% 90%",
      "0 0% 46%",
      "0 0% 68%",
      "0 0% 85%",
      "0 0% 96%",
    ],
  },
  {
    id: "dmg",
    swatch: [
      "68 90% 66%",
      "100 55% 50%",
      "74 88% 62%",
      "120 40% 36%",
      "90 50% 54%",
      "82 65% 58%",
      "74 78% 72%",
    ],
  },
  {
    id: "minitel",
    swatch: [
      "6 78% 62%",
      "155 52% 55%",
      "45 78% 66%",
      "205 82% 64%",
      "320 55% 70%",
      "180 66% 60%",
      "190 24% 90%",
    ],
  },
  {
    id: "newsprint",
    swatch: [
      "2 68% 45%",
      "150 48% 32%",
      "40 82% 42%",
      "215 62% 42%",
      "320 45% 44%",
      "190 55% 34%",
      "30 14% 20%",
    ],
  },
];
