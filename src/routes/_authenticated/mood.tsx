import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { moodDistribution, moodSeries, withinDays } from "@/lib/insights";
import { findMood } from "@/lib/moods";

export const Route = createFileRoute("/_authenticated/mood")({
  head: () => ({
    meta: [
      { title: "Mood analytics — Peace Companion" },
      {
        name: "description",
        content:
          "See your 7-day and 30-day mood charts, your most common mood, and friendly descriptive trends.",
      },
      { property: "og:title", content: "Mood analytics — Peace Companion" },
      {
        property: "og:description",
        content: "Charts and gentle observations built only from your own mood check-ins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoodPage,
});

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

function MoodPage() {
  const query = useQuery({
    queryKey: ["mood-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("id, mood_label, mood_score, note, created_at")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data;
    },
  });

  const checkIns = query.data ?? [];
  const week = withinDays(checkIns, 7);
  const month = withinDays(checkIns, 30);
  const distribution = moodDistribution(month);
  const top = distribution[0];
  const avg = (list: { mood_score: number }[]) =>
    list.length ? list.reduce((s, c) => s + c.mood_score, 0) / list.length : 0;
  const trend = week.length && month.length > week.length ? avg(week) - avg(month) : 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Mood analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Descriptive patterns from your own check-ins — never a diagnosis.
          </p>
        </div>
        <Link
          to="/check-in"
          className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
        >
          New check-in
        </Link>
      </div>

      {query.isLoading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      ) : checkIns.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Once you've saved a check-in, your charts will appear here.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Most common mood</p>
              <p className="mt-3 text-2xl">
                {top ? `${findMood(top.label).emoji} ${top.label}` : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Check-ins</p>
              <p className="mt-3 text-2xl">{checkIns.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">{week.length} in the last 7 days</p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Trend</p>
              <p className="mt-3 text-sm">
                {Math.abs(trend) < 0.3
                  ? "Fairly steady compared with your month."
                  : trend > 0
                    ? "A little brighter than your monthly average."
                    : "Heavier than your monthly average. Be kind to yourself."}
              </p>
            </div>
          </div>

          <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
            <h2 className="text-lg">Last 7 days</h2>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={moodSeries(checkIns, 7)} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="mood" stroke="var(--primary)" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
            <h2 className="text-lg">Last 30 days</h2>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={moodSeries(checkIns, 30)} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} stroke="var(--muted-foreground)" />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="mood" stroke="var(--chart-2)" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
            <h2 className="text-lg">Mood distribution</h2>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-lg">Recent notes</h2>
            <ul className="mt-3 space-y-3">
              {checkIns.slice(0, 10).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {findMood(entry.mood_label).emoji} {entry.mood_label}
                    </span>
                    <time className="text-muted-foreground" dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {entry.note && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{entry.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
