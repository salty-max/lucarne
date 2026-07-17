import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { match } from "../../test/fixtures";
import { renderWithRouter } from "../../test/router";
import { MatchTable } from "./DaySection";

describe("MatchTable", () => {
  it("renders the group label and its matches", async () => {
    // Rows are clickable (useNavigate), so it needs a router context; the router
    // mounts asynchronously, so await the first element.
    renderWithRouter(
      <MatchTable groups={[{ key: "2025-08-16", label: "Saturday 16 August", matches: [match()] }]} />,
    );
    expect(await screen.findByText("Saturday 16 August")).toBeDefined();
    expect(screen.getByText("PSG")).toBeDefined();
  });

  it("renders nothing when every group is empty", () => {
    const { container } = render(<MatchTable groups={[{ key: "x", matches: [] }]} />);
    expect(container.firstChild).toBeNull();
  });
});
