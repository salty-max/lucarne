import { describe, expect, it } from "bun:test";
import { asNotifyLang, renderNotify, type NotifyMessage } from "@/lib/notify";

// One sample of every message the push trigger can emit. A new `NotifyMessage`
// variant won't typecheck here until it's added, so nothing ships untranslated.
const SAMPLES: NotifyMessage[] = [
  { id: "lineups" },
  { id: "kickoffSoon" },
  { id: "kickoff" },
  { id: "halfTime", score: "1–0" },
  { id: "extraTime" },
  { id: "shootout" },
  { id: "goal", score: "1–0", player: "Mbappé", minute: "23'", ownGoal: false },
  { id: "goal", score: "1–1", player: "Rice", minute: "44'", ownGoal: true },
  { id: "penaltyMissed", player: "Kane", minute: "82'" },
  { id: "yellow", player: "Rice", minute: "65'" },
  { id: "red", player: "Konaté", minute: "70'" },
  { id: "secondYellow", player: "Barcola", minute: "80'" },
  { id: "subs", minute: "60'", lines: ["France · Thuram ↑ Barcola ↓"] },
  { id: "fullTime", score: "1–2", scorers: "Mbappé / Kane, Bellingham" },
  { id: "motm", player: "Mbappé", rating: 8.7 },
  { id: "welcome" },
];

describe("renderNotify", () => {
  it("writes every message in both languages", () => {
    for (const m of SAMPLES) {
      for (const lang of ["en", "fr"] as const) {
        expect(renderNotify(m, lang), `${m.id}/${lang}`).not.toBe("");
      }
    }
  });

  it("translates the label but keeps names, scores and minutes as they are", () => {
    const goal: NotifyMessage = { id: "goal", score: "1–0", player: "Mbappé", minute: "23'", ownGoal: false };
    expect(renderNotify(goal, "en")).toBe("⚽ 1–0 · Mbappé 23'");
    expect(renderNotify({ id: "fullTime", score: "1–2", scorers: "Kane" }, "en")).toBe("⏱ Full time · 1–2 · Kane");
    expect(renderNotify({ id: "fullTime", score: "1–2", scorers: "Kane" }, "fr")).toBe("⏱ Fin · 1–2 · Kane");
  });

  it("marks own goals in the right language", () => {
    const og: NotifyMessage = { id: "goal", score: "0–1", player: "Upamecano", minute: "12'", ownGoal: true };
    expect(renderNotify(og, "en")).toContain("(og)");
    expect(renderNotify(og, "fr")).toContain("(csc)");
  });

  it("drops the rating when the API never published one", () => {
    expect(renderNotify({ id: "motm", player: "Mbappé", rating: null }, "en")).toBe("⭐ Man of the match · Mbappé");
  });

  it("omits the scorer line when nobody scored", () => {
    expect(renderNotify({ id: "fullTime", score: "0–0", scorers: "" }, "fr")).toBe("⏱ Fin · 0–0");
  });
});

describe("asNotifyLang", () => {
  it("accepts the supported languages", () => {
    expect(asNotifyLang("en")).toBe("en");
    expect(asNotifyLang("fr")).toBe("fr");
  });

  it("rejects anything else, so a bad payload falls back to the default", () => {
    for (const v of ["de", "", "EN", null, undefined, 42, {}]) {
      expect(asNotifyLang(v), String(v)).toBeNull();
    }
  });
});
