import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { moodEmoji } from "@/lib/moods";

/** Searches only the signed-in person's own rows — RLS enforces this server-side too. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = term.trim();

  const results = useQuery({
    queryKey: ["search", query],
    enabled: open && query.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const pattern = `%${query.replace(/[%_]/g, "")}%`;
      const [journal, conversations, checkIns] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("id, title, content")
          .or(`title.ilike.${pattern},content.ilike.${pattern}`)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("conversations")
          .select("id, title")
          .ilike("title", pattern)
          .order("updated_at", { ascending: false })
          .limit(6),
        supabase
          .from("check_ins")
          .select("id, mood_label, note, created_at")
          .ilike("note", pattern)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      return {
        journal: journal.data ?? [],
        conversations: conversations.data ?? [],
        checkIns: checkIns.data ?? [],
      };
    },
  });

  const data = results.data;
  const nothing =
    query.length >= 2 &&
    !results.isLoading &&
    data &&
    !data.journal.length &&
    !data.conversations.length &&
    !data.checkIns.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search your space</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0">
        <Command shouldFilter={false}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Search your journal, conversations and notes…"
        />
        <CommandList>
          {query.length < 2 && (
            <CommandEmpty>Type at least two characters to search your own entries.</CommandEmpty>
          )}
          {results.isLoading && <CommandEmpty>Searching…</CommandEmpty>}
          {nothing && <CommandEmpty>Nothing matched that yet.</CommandEmpty>}

          {!!data?.journal.length && (
            <CommandGroup heading="Journal">
              {data.journal.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/journal/$entryId", params: { entryId: entry.id } });
                  }}
                >
                  <span className="truncate">{entry.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!data?.conversations.length && (
            <CommandGroup heading="Conversations">
              {data.conversations.map((conversation) => (
                <CommandItem
                  key={conversation.id}
                  value={conversation.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/companion" });
                  }}
                >
                  <span className="truncate">{conversation.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!data?.checkIns.length && (
            <CommandGroup heading="Mood notes">
              {data.checkIns.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/mood" });
                  }}
                >
                  <span className="mr-2">{moodEmoji(entry.mood_label)}</span>
                  <span className="truncate">{entry.note}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
