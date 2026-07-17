import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * Render UI inside a minimal in-memory router so components that use <Link>
 * (e.g. MatchList) have the router context they need.
 */
export function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const matchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/match/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([matchRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}
