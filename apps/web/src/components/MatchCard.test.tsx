import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { eventMark, eventName } from "@/lib/matchEvents";
import { goal, match } from "../../test/fixtures";
import { MatchCard } from "./MatchCard";

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
  it("shows kickoff time + teams + competition + broadcaster for a scheduled match", () => {
    render(<MatchCard m={match()} />);
    expect(screen.getByText("21:00")).toBeDefined();
    expect(screen.getByText("PSG")).toBeDefined();
    expect(screen.getByText("OM")).toBeDefined();
    expect(screen.getByText("Ligue 1")).toBeDefined();
    expect(screen.getByText("CANAL+")).toBeDefined();
  });

  it("shows the live minute and score for a live match", () => {
    render(<MatchCard m={match({ status: "live", elapsed: 63, homeGoals: 1, awayGoals: 0 })} />);
    expect(screen.getByText("63'")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
  });

  it("renders scorers and the finished label", () => {
    render(
      <MatchCard
        m={match({
          status: "finished",
          homeGoals: 1,
          awayGoals: 0,
          events: [goal({ player: "Mbappé", minute: 23 })],
        })}
      />,
    );
    expect(screen.getByText("Mbappé")).toBeDefined();
    expect(screen.getByText("23'")).toBeDefined();
    expect(screen.getByText("FT")).toBeDefined();
  });

  it("labels an extra-time result AET", () => {
    render(<MatchCard m={match({ status: "finished", statusShort: "AET", homeGoals: 2, awayGoals: 1 })} />);
    expect(screen.getByText("AET")).toBeDefined();
  });

  it("shows the shootout result and marks the penalty winner", () => {
    render(
      <MatchCard
        m={match({
          status: "finished",
          statusShort: "PEN",
          homeGoals: 1,
          awayGoals: 1,
          homePenalties: 2,
          awayPenalties: 4, // away wins the shootout despite level goals
          home: { name: "France", shortName: null, logo: null },
          away: { name: "Croatia", shortName: null, logo: null },
        })}
      />,
    );
    expect(screen.getByText("Pens")).toBeDefined();
    expect(screen.getByText("(2)")).toBeDefined();
    expect(screen.getByText("(4)")).toBeDefined();
    // The shootout winner's name is emphasised; the loser's is dimmed.
    expect(screen.getByText("Croatia").className).toContain("font-semibold");
    expect(screen.getByText("France").className).toContain("text-muted-foreground");
  });
});
