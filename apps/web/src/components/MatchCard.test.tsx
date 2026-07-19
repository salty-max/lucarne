import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Match } from "@lucarne/shared";
import { eventMark, eventName } from "@/lib/matchEvents";
import { goal, match } from "../../test/fixtures";
import { MatchCard } from "./MatchCard";

/** MatchCard renders a <tr> (in a table) and reads the radar watch query, so it
 *  needs a QueryClientProvider. */
const renderCard = (m: Match) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <table>
        <tbody>
          <MatchCard m={m} />
        </tbody>
      </table>
    </QueryClientProvider>,
  );
};

describe("event helpers", () => {
  it("eventMark picks a kind by type/detail", () => {
    expect(eventMark(goal())).toBe("goal");
    expect(eventMark(goal({ type: "Card", detail: "Yellow Card" }))).toBe("yellow");
    expect(eventMark(goal({ type: "Card", detail: "Red Card" }))).toBe("red");
    expect(eventMark(goal({ type: "subst" }))).toBeNull();
  });

  it("eventName annotates penalties and own goals", () => {
    expect(eventName(goal({ player: "Mbappé" }))).toBe("Mbappé");
    expect(eventName(goal({ player: "Mbappé", detail: "Penalty" }))).toBe("Mbappé (pen)");
    expect(eventName(goal({ player: "Maignan", detail: "Own Goal" }))).toBe("Maignan (og)");
  });
});

describe("MatchCard", () => {
  it("shows kickoff time, teams and broadcaster for a scheduled match", () => {
    renderCard(match());
    expect(screen.getByText("21:00")).toBeDefined();
    expect(screen.getByText("PSG")).toBeDefined();
    expect(screen.getByText("OM")).toBeDefined();
    expect(screen.getByText("CANAL+")).toBeDefined();
  });

  it("shows the live minute and score for a live match", () => {
    renderCard(match({ status: "live", elapsed: 63, homeGoals: 1, awayGoals: 0 }));
    expect(screen.getByText("63'")).toBeDefined();
    expect(screen.getByText("1–0")).toBeDefined();
  });

  it("shows the score and a full-time tag for a finished match", () => {
    renderCard(match({ status: "finished", homeGoals: 1, awayGoals: 0 }));
    expect(screen.getByText("1–0")).toBeDefined();
    expect(screen.getByText("FT")).toBeDefined();
  });

  it("labels an extra-time result", () => {
    renderCard(match({ status: "finished", statusShort: "AET", homeGoals: 2, awayGoals: 1 }));
    expect(screen.getByText("AET")).toBeDefined();
  });

  it("shows the shootout result and marks the penalty winner", () => {
    renderCard(
      match({
        status: "finished",
        statusShort: "PEN",
        homeGoals: 1,
        awayGoals: 1,
        homePenalties: 2,
        awayPenalties: 4, // away wins the shootout despite level goals
        home: { name: "France", shortName: null, logo: null },
        away: { name: "Croatia", shortName: null, logo: null },
      }),
    );
    expect(screen.getByText("Pens")).toBeDefined();
    expect(screen.getByText("(2-4)")).toBeDefined();
    // The shootout winner's name goes green/bold; the loser stays plain.
    expect(screen.getByText("Croatia").className).toContain("font-bold");
    expect(screen.getByText("France").className).toContain("text-foreground");
  });
});
