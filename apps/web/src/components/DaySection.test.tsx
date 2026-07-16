import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { match } from "../../test/fixtures";
import { DaySection } from "./DaySection";

describe("DaySection", () => {
  it("renders the day label and its matches", () => {
    render(<DaySection day={{ key: "2025-08-16", label: "samedi 16 août", matches: [match()] }} />);
    expect(screen.getByText("samedi 16 août")).toBeDefined();
    expect(screen.getByText("PSG")).toBeDefined();
  });

  it("renders nothing for an empty day", () => {
    const { container } = render(<DaySection day={{ key: "x", label: "x", matches: [] }} />);
    expect(container.firstChild).toBeNull();
  });
});
