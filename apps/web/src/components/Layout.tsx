import { useState } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Re-key the content on each route so the entrance animation replays.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar open={menuOpen} onOpenChange={setMenuOpen} />
      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1">
          <div key={pathname} className="animate-enter mx-auto w-full max-w-3xl px-4 py-6">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
