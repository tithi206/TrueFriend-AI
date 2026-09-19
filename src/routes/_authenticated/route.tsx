import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Heart,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Moon,
  Sparkles,
  Sun,
  TrendingUp,
  User,
} from "lucide-react";

import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companion", label: "Conversations", icon: MessageCircle },
  { to: "/mood", label: "Mood", icon: Heart },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/activities", label: "Activities", icon: Sparkles },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const MOBILE_NAV = NAV.filter((item) =>
  ["/dashboard", "/companion", "/mood", "/journal", "/activities"].includes(item.to),
);

function AuthenticatedLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();

  if (!loading && !user) {
    navigate({ to: "/auth" });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-card/50 px-4 py-5 lg:flex">
        <Link to="/dashboard" className="px-2 font-serif text-lg tracking-tight text-foreground">
          Peace Companion
        </Link>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-1">
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-2xl px-3 text-muted-foreground"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen w-full min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-card/70 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link to="/dashboard" className="font-serif text-base tracking-tight lg:hidden">
              Peace Companion
            </Link>
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {user?.user_metadata?.["display_name"] ?? user?.email ?? ""}
            </span>
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full lg:hidden"
                aria-label="Toggle dark mode"
                onClick={toggle}
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Link
                to="/progress"
                className="hidden rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:inline-flex"
                aria-label="Progress"
              >
                <BarChart3 className="size-4" />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/70 bg-card/95 backdrop-blur lg:hidden">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground transition-colors [&.active]:text-foreground"
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
