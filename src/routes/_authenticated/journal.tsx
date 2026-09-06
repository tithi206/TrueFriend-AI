import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { MOODS, moodEmoji } from "@/lib/moods";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Private journal — Peace Companion" },
      {
        name: "description",
        content:
          "Write, search and revisit private journal entries, tag them with a mood, and ask for a gentle reflection prompt.",
      },
      { property: "og:title", content: "Private journal — Peace Companion" },
      {
        property: "og:description",
        content: "Your private journal with mood tags, search and optional AI reflection prompts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JournalLayout,
});

const PAGE_SIZE = 10;

function JournalLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/journal") return <Outlet />;
  return <JournalList />;
}

function JournalList() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [page, setPage] = useState(0);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", mood: "Okay" });

  const entries = useQuery({
    queryKey: ["journal", { term, mood, from, page }],
    queryFn: async () => {
      let request = supabase
        .from("journal_entries")
        .select("id, title, content, mood, created_at, updated_at")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const clean = term.trim().replace(/[%_]/g, "");
      if (clean.length >= 2) request = request.or(`title.ilike.%${clean}%,content.ilike.%${clean}%`);
      if (mood) request = request.eq("mood", mood);
      if (from) request = request.gte("created_at", new Date(from).toISOString());

      const { data, error } = await request;
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim() || !draft.content.trim()) throw new Error("Add a title and a few words.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("journal_entries").insert({
        user_id: auth.user.id,
        title: draft.title.trim().slice(0, 120),
        content: draft.content.trim(),
        mood: draft.mood,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ title: "", content: "", mood: "Okay" });
      setComposing(false);
      toast.success("Entry saved to your private journal.");
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save."),
  });

  const list = useMemo(() => entries.data ?? [], [entries.data]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Your journal</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" /> Private to you — only you can read these entries.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setComposing((v) => !v)}>
          <Plus className="mr-1 size-4" /> New entry
        </Button>
      </div>

      {composing && (
        <div className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Give this entry a title"
            className="rounded-2xl bg-background"
          />
          <Textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={7}
            placeholder="What's on your mind?"
            className="mt-3 resize-none rounded-2xl bg-background"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.label}
                onClick={() => setDraft({ ...draft, mood: m.label })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  draft.mood === m.label
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
          <Button
            className="mt-4 rounded-full"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? "Saving…" : "Save entry"}
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setPage(0);
              setTerm(e.target.value);
            }}
            placeholder="Search your entries"
            className="rounded-full bg-background pl-9"
          />
        </div>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setPage(0);
            setFrom(e.target.value);
          }}
          className="w-40 rounded-full bg-background"
        />
        <select
          value={mood ?? ""}
          onChange={(e) => {
            setPage(0);
            setMood(e.target.value || null);
          }}
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All moods</option>
          {MOODS.map((m) => (
            <option key={m.label} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {entries.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {term || mood || from ? "Nothing matched those filters." : "No entries yet — your first one can be two sentences."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((entry) => (
            <li key={entry.id}>
              <Link
                to="/journal/$entryId"
                params={{ entryId: entry.id }}
                className="block rounded-2xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">
                    {moodEmoji(entry.mood)} {entry.title}
                  </span>
                  <time className="shrink-0 text-muted-foreground" dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </time>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{entry.content}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page + 1}</span>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          disabled={list.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
