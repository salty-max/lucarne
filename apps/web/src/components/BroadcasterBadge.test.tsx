import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { broadcaster } from "../../test/fixtures";
import { BroadcasterBadge } from "./BroadcasterBadge";

describe("BroadcasterBadge", () => {
  it("renders the broadcaster name", () => {
    render(<BroadcasterBadge b={broadcaster({ name: "beIN SPORTS" })} />);
    expect(screen.getByText("beIN SPORTS")).toBeDefined();
  });
});
