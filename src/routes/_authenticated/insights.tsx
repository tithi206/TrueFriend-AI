import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { buildInsights, moodDistribution, withinDays } from "@/lib/insights";
import { findMood } from "@/lib/moods";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Personal insights — Peace Companion" },
      {
        name: "description",
        content:
          "Friendly, descriptive observations built only from your own check-ins, journal entries and activities.",
      },
      { property: "og:title", content: "Personal insights — Peace Companion" },
      {
        property: "og:description",
        content: "Descriptive patterns from your own wellbeing data — never a diagnosis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const query = useQuery({
    queryKey: ["insights"],
    queryFn: async () => {
      const [checkIns, journal, activities, conversations] = await Promise.all([
        supabase
          .from("check_ins")
          .select("mood_label, mood_score, note, created_at")
          .order("created_at", { ascending: false })
          .limit(400),
        supabase.from("journal_entries").select("created_at").limit(400),
        supabase.from("activity_completions").select("activity_type, completed_at").limit(400),
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
  const lines = data
    ? buildInsights({
        checkIns: data.checkIns,
        journalCount7: data.journal.filter((j) => new Date(j.created_at).getTime() > Date.now() - 7 * 864e5)
          .length,
        activityCount7: data.activities.filter(
          (a) => new Date(a.completed_at).getTime() > Date.now() - 7 * 864e5,
        ).length,
        conversationCount: data.conversationCount,
      })
    : [];

  const monthDistribution = moodDistribution(withinDays(data?.checkIns ?? [], 30));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Your insights</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Descriptions of what you've recorded — not assessments of your health.
      </p>

      {query.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {lines.map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm"
              >
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                {line}
              </li>
            ))}
          </ul>

          {monthDistribution.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg">Your moods over 30 days</h2>
              <ul className="mt-3 space-y-2">
                {monthDistribution.map((row) => (
                  <li key={row.label} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0">
                      {findMood(row.label).emoji} {row.label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${(row.count / (monthDistribution[0]?.count || 1)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 text-right text-muted-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-8 rounded-2xl border border-border/70 bg-secondary/40 p-4 text-xs text-muted-foreground">
            Peace Companion supports reflection. It doesn't replace professional mental-health care. If
            something feels urgent, please contact a trusted adult, a qualified professional, or your local
            emergency or crisis service.{" "}
            <Link to="/companion" className="underline">
              Talk it through
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
