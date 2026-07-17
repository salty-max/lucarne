import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { broadcaster } from "../../test/fixtures";
import { BroadcasterBadge, BroadcasterList } from "./BroadcasterBadge";

describe("BroadcasterBadge", () => {
  it("renders the broadcaster name", () => {
    render(<BroadcasterBadge b={broadcaster({ name: "beIN SPORTS" })} />);
    expect(screen.getByText("beIN SPORTS")).toBeDefined();
  });
});

describe("BroadcasterList", () => {
  it("shows a placeholder when empty", () => {
    render(<BroadcasterList list={[]} />);
    expect(screen.getByText(/Broadcaster TBC/)).toBeDefined();
  });

  it("shows a single broadcaster with no separator", () => {
    render(<BroadcasterList list={[broadcaster({ name: "CANAL+" })]} />);
    expect(screen.getByText("CANAL+")).toBeDefined();
    expect(screen.queryByText("or")).toBeNull();
  });

  it("marks split rights with a separator and a caveat", () => {
    render(
      <BroadcasterList
        list={[
          broadcaster({ id: 3, name: "Ligue 1+", coverage: "partial" }),
          broadcaster({ id: 1, name: "Amazon Prime Video", coverage: "partial" }),
        ]}
      />,
    );
    expect(screen.getByText("Ligue 1+")).toBeDefined();
    expect(screen.getByText("Amazon Prime Video")).toBeDefined();
    expect(screen.getByText("or")).toBeDefined();
    expect(screen.getByText(/depending/)).toBeDefined();
  });
});
