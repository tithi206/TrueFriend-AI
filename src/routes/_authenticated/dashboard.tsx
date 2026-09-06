import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Heart, MessageCircle, Sparkles, TrendingUp, Wind } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { moodSeries, streakFrom, withinDays } from "@/lib/insights";
import { findMood } from "@/lib/moods";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Peace Companion" },
      {
        name: "description",
        content:
          "Today's mood, your latest journal entry, recent conversation and weekly overview in one calm place.",
      },
      { property: "og:title", content: "Your dashboard — Peace Companion" },
      {
        property: "og:description",
        content: "A gentle daily overview of your mood, journal, conversations and activities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const QUICK_ACTIONS = [
  { to: "/check-in", label: "Check in", icon: Heart },
  { to: "/companion", label: "Start a conversation", icon: MessageCircle },
  { to: "/journal", label: "Write a journal entry", icon: BookOpen },
  { to: "/activities", label: "Breathing exercise", icon: Wind },
  { to: "/progress", label: "View progress", icon: TrendingUp },
] as const;

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-border/70 bg-card/70 p-5 transition-shadow hover:shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function DashboardPage() {
  const overview = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [checkIns, journal, conversation, activities] = await Promise.all([
        supabase
          .from("check_ins")
          .select("mood_label, mood_score, note, created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("journal_entries")
          .select("id, title, content, mood, created_at")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("conversations")
          .select("id, title, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase
          .from("activity_completions")
          .select("activity_type, completed_at")
          .order("completed_at", { ascending: false })
          .limit(90),
      ]);
      return {
        checkIns: checkIns.data ?? [],
        journal: journal.data?.[0] ?? null,
        conversation: conversation.data?.[0] ?? null,
        activities: activities.data ?? [],
      };
    },
  });

  const data = overview.data;
  const checkIns = data?.checkIns ?? [];
  const today = checkIns[0];
  const todayMood = today ? findMood(today.mood_label) : null;
  const streak = streakFrom(checkIns.map((c) => c.created_at));
  const weekActivities = data
    ? data.activities.filter((a) => new Date(a.completed_at).getTime() > Date.now() - 7 * 864e5).length
    : 0;
  const series = moodSeries(checkIns, 7);
  const weekCount = withinDays(checkIns, 7).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Here's a gentle look at your week. Small steps count.
      </p>

      {overview.isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Today's mood</p>
              {todayMood ? (
                <>
                  <p className="mt-3 text-2xl">
                    {todayMood.emoji} {todayMood.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Logged {new Date(today!.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No check-in yet.{" "}
                  <Link to="/check-in" className="text-primary underline">
                    Add one
                  </Link>
                  .
                </p>
              )}
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest journal entry</p>
              {data?.journal ? (
                <Link to="/journal/$entryId" params={{ entryId: data.journal.id }} className="mt-3 block">
                  <p className="truncate font-medium">{data.journal.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{data.journal.content}</p>
                </Link>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing written yet.{" "}
                  <Link to="/journal" className="text-primary underline">
                    Start writing
                  </Link>
                  .
                </p>
              )}
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent conversation</p>
              {data?.conversation ? (
                <Link to="/companion" className="mt-3 block">
                  <p className="truncate font-medium">{data.conversation.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(data.conversation.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </p>
                </Link>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No conversations yet.{" "}
                  <Link to="/companion" className="text-primary underline">
                    Say hello
                  </Link>
                  .
                </p>
              )}
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Check-in streak</p>
              <p className="mt-3 text-2xl">
                {streak} day{streak === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{weekCount} check-ins in the last 7 days</p>
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Activities this week</p>
              <p className="mt-3 text-2xl">{weekActivities}</p>
              <Link to="/activities" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                <Sparkles className="size-3" /> Try a calming activity
              </Link>
            </Card>

            <Card className="sm:col-span-2 lg:col-span-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Weekly mood overview</p>
              <div className="mt-3 h-28">
                {weekCount > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                      <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="mood"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.18}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">Your chart appears after your first check-in.</p>
                )}
              </div>
            </Card>
          </div>

          <h2 className="mt-10 text-xl">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
