import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, lastNDays, streakFrom } from "@/lib/insights";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({
    meta: [
      { title: "Your progress — Peace Companion" },
      {
        name: "description",
        content:
          "Check-in and journal streaks, activities completed and a weekly summary of your own wellbeing habits.",
      },
      { property: "og:title", content: "Your progress — Peace Companion" },
      {
        property: "og:description",
        content: "Gentle progress tracking: streaks, activities and weekly summaries. Small steps count.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const query = useQuery({
    queryKey: ["progress"],
    queryFn: async () => {
      const [checkIns, journal, activities, conversations] = await Promise.all([
        supabase.from("check_ins").select("created_at").order("created_at", { ascending: false }).limit(400),
        supabase
          .from("journal_entries")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("activity_completions")
          .select("activity_type, completed_at")
          .order("completed_at", { ascending: false })
          .limit(400),
        supabase.from("conversations").select("id").limit(500),
      ]);
      return {
        checkIns: checkIns.data ?? [],
        journal: journal.data ?? [],
        activities: activities.data ?? [],
        conversationCount: conversations.data?.length ?? 0,
      };
    },
  });

  const data = query.data;
  const weekly = lastNDays(7).map(({ key, label }) => ({
    day: label,
    checkIns: (data?.checkIns ?? []).filter((c) => dayKey(c.created_at) === key).length,
    journal: (data?.journal ?? []).filter((j) => dayKey(j.created_at) === key).length,
    activities: (data?.activities ?? []).filter((a) => dayKey(a.completed_at) === key).length,
  }));

  const stats = [
    { label: "Check-in streak", value: `${streakFrom((data?.checkIns ?? []).map((c) => c.created_at))} days` },
    { label: "Journal streak", value: `${streakFrom((data?.journal ?? []).map((j) => j.created_at))} days` },
    { label: "Activities completed", value: String(data?.activities.length ?? 0) },
    { label: "Conversations", value: String(data?.conversationCount ?? 0) },
    { label: "Mood check-ins", value: String(data?.checkIns.length ?? 0) },
    { label: "Journal entries", value: String(data?.journal.length ?? 0) },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Your progress</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No scores, no comparisons — just what you've shown up for. Small steps count.
      </p>

      {query.isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-border/70 bg-card/70 p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                <p className="mt-3 text-2xl">{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
            <h2 className="text-lg">This week</h2>
            <div className="mt-4 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="checkIns" name="Check-ins" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="journal" name="Journal" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="activities" name="Activities" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
