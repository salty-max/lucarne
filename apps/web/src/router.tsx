import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import Today from "@/routes/Today";
import Calendar from "@/routes/Calendar";
import Competitions from "@/routes/Competitions";
import Competition from "@/routes/Competition";
import MatchDetail from "@/routes/MatchDetail";
import Broadcasters from "@/routes/Broadcasters";

const rootRoute = createRootRoute({ component: Layout });

const todayRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Today });
const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/calendar", component: Calendar });
const competitionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/competitions", component: Competitions });
const competitionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/competitions/$slug",
  component: Competition,
});
const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/match/$id",
  component: MatchDetail,
});
const broadcastersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/broadcasters",
  component: Broadcasters,
});

const routeTree = rootRoute.addChildren([
  todayRoute,
  calendarRoute,
  competitionsRoute,
  competitionRoute,
  matchRoute,
  broadcastersRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
