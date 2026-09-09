import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { MOODS, moodEmoji } from "@/lib/moods";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/check-in")({
  head: () => ({
    meta: [
      { title: "Mood check-ins & journal — Peace Companion" },
      {
        name: "description",
        content:
          "Log how you feel, add a private journal note, and watch your mood patterns unfold over time.",
      },
      { property: "og:title", content: "Mood check-ins & journal — Peace Companion" },
      {
        property: "og:description",
        content: "Track your mood and keep private journal notes alongside your conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckInPage,
});


function CheckInPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const checkIns = useQuery({
    queryKey: ["check-ins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("id, mood_score, mood_label, note, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const mood = MOODS.find((m) => m.label === selected);
      if (!mood) throw new Error("Pick how you're feeling first.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("check_ins").insert({
        user_id: auth.user.id,
        mood_score: mood.score,
        mood_label: mood.label,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(null);
      setNote("");
      toast.success("Check-in saved.");
      queryClient.invalidateQueries({ queryKey: ["check-ins"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save."),
  });

  const entries = checkIns.data ?? [];
  const average =
    entries.length > 0
      ? (entries.reduce((sum, e) => sum + e.mood_score, 0) / entries.length).toFixed(1)
      : "—";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-3xl">How are you feeling right now?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A quick check-in helps your companion understand where you're at.
      </p>

      <div className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
        <div className="flex flex-wrap gap-2">
          {MOODS.map((mood) => (
            <button
              key={mood.label}
              onClick={() => setSelected(mood.label)}
              className={cn(
                "flex flex-1 min-w-24 flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm transition-colors",
                selected === mood.label
                  ? "border-primary bg-secondary text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              <span className="text-xl">{mood.emoji}</span>
              {mood.label}
            </button>
          ))}
        </div>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Anything you'd like to write down? (optional)"
          className="mt-4 resize-none rounded-2xl bg-background"
        />

        <Button
          className="mt-4 rounded-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || selected === null}
        >
          {save.isPending ? "Saving…" : "Save check-in"}
        </Button>
      </div>

      <div className="mt-10 flex items-baseline justify-between">
        <h2 className="text-xl">Your recent check-ins</h2>
        <p className="text-sm text-muted-foreground">Average mood: {average} / 5</p>
      </div>

      <ul className="mt-4 space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {moodEmoji(entry.mood_label)} {entry.mood_label}
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
        {entries.length === 0 && !checkIns.isLoading && (
          <li className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No check-ins yet. Your first one is above.
          </li>
        )}
      </ul>
    </div>
  );
}
