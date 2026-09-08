import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { reflectOnEntry } from "@/lib/journal.functions";
import { MOODS } from "@/lib/moods";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/$entryId")({
  head: () => ({
    meta: [
      { title: "Journal entry — Peace Companion" },
      {
        name: "description",
        content: "Read, edit or delete one of your private journal entries and ask for a gentle reflection.",
      },
      { property: "og:title", content: "Journal entry — Peace Companion" },
      { property: "og:description", content: "One private journal entry, with optional AI reflection." },
      { property: "og:type", content: "article" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reflect = useServerFn(reflectOnEntry);

  const [form, setForm] = useState({ title: "", content: "", mood: "Okay" });
  const [reflection, setReflection] = useState<string | null>(null);

  const entry = useQuery({
    queryKey: ["journal-entry", entryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, title, content, mood, created_at, updated_at")
        .eq("id", entryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (entry.data) {
      setForm({ title: entry.data.title, content: entry.data.content, mood: entry.data.mood ?? "Okay" });
    }
  }, [entry.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() || !form.content.trim()) throw new Error("Title and content can't be empty.");
      const { error } = await supabase
        .from("journal_entries")
        .update({ title: form.title.trim(), content: form.content.trim(), mood: form.mood })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry updated.");
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry", entryId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("journal_entries").delete().eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted.");
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/journal" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't delete."),
  });

  const askReflection = useMutation({
    mutationFn: async () => reflect({ data: { entryId } }),
    onSuccess: (result) => setReflection(result.reflection),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't build a reflection."),
  });

  if (entry.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!entry.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">That entry couldn't be found.</p>
        <Link to="/journal" className="mt-4 inline-block text-primary underline">
          Back to your journal
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link to="/journal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Journal
      </Link>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Private entry ·{" "}
        {new Date(entry.data.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </p>

      <Input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="mt-3 rounded-2xl bg-background text-lg"
      />
      <Textarea
        value={form.content}
        onChange={(e) => setForm({ ...form, content: e.target.value })}
        rows={12}
        className="mt-3 resize-none rounded-2xl bg-background"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.label}
            onClick={() => setForm({ ...form, mood: m.label })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              form.mood === m.label
                ? "border-primary bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => askReflection.mutate()}
          disabled={askReflection.isPending}
        >
          <Sparkles className="mr-1 size-4" />
          {askReflection.isPending ? "Reflecting…" : "Reflect on this entry"}
        </Button>
        <Button
          variant="ghost"
          className="rounded-full text-destructive"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          <Trash2 className="mr-1 size-4" /> Delete
        </Button>
      </div>

      {reflection && (
        <div className="mt-6 rounded-3xl border border-border/70 bg-secondary/50 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">A gentle reflection</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{reflection}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            A reflection prompt only — not advice, not a diagnosis.
          </p>
        </div>
      )}
    </div>
  );
}
