import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * Render UI inside a minimal in-memory router (for <Link>/useNavigate) AND a
 * QueryClientProvider (for components that read queries, e.g. the radar switch).
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
