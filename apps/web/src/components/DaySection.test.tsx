import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { match } from "../../test/fixtures";
import { renderWithRouter } from "../../test/router";
import { DaySection } from "./DaySection";

describe("DaySection", () => {
  it("renders the day label and its matches", async () => {
    // Non-empty day renders MatchList → <Link>, so it needs a router context;
    // the router mounts asynchronously, so await the first element.
    renderWithRouter(
      <DaySection day={{ key: "2025-08-16", label: "samedi 16 août", matches: [match()] }} />,
    );
    expect(await screen.findByText("samedi 16 août")).toBeDefined();
    expect(screen.getByText("PSG")).toBeDefined();
  });

  it("renders nothing for an empty day", () => {
    // Empty day short-circuits to null before reaching any <Link>.
    const { container } = render(<DaySection day={{ key: "x", label: "x", matches: [] }} />);
    expect(container.firstChild).toBeNull();
  });
});
