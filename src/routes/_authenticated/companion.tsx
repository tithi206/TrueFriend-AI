import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage } from "@/lib/companion.functions";
import { CHAT_STYLES, DEFAULT_CHAT_STYLE, findChatStyle, type ChatStyleId } from "@/lib/chat-styles";
import { cn } from "@/lib/utils";

const STYLE_KEY = "peace-chat-style";

export const Route = createFileRoute("/_authenticated/companion")({
  head: () => ({
    meta: [
      { title: "Your conversations — Peace Companion" },
      {
        name: "description",
        content:
          "Talk things through with an empathetic AI companion. Every conversation is saved privately so you can return to it any time.",
      },
      { property: "og:title", content: "Your conversations — Peace Companion" },
      {
        property: "og:description",
        content: "A calm, private space to talk things through, with your history kept safe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompanionPage,
});

const STARTERS = [
  "I'm feeling overwhelmed today",
  "Help me quiet my anxious thoughts",
  "I can't stop overthinking a conversation",
  "I want to feel grateful again",
];

type Message = { id: string; role: string; content: string; created_at: string };

function CompanionPage() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendMessage);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [style, setStyle] = useState<ChatStyleId>(DEFAULT_CHAT_STYLE);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved && CHAT_STYLES.some((s) => s.id === saved)) setStyle(saved as ChatStyleId);
  }, []);

  function chooseStyle(id: ChatStyleId) {
    setStyle(id);
    localStorage.setItem(STYLE_KEY, id);
    toast.success(`Chat style: ${findChatStyle(id).label}`);
  }

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const messages = useQuery({
    queryKey: ["messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
  });

  const mutation = useMutation({
    mutationFn: (content: string) => send({ data: { conversationId: activeId, content } }),
    onSuccess: async (result) => {
      setActiveId(result.conversationId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", result.conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setPending(null);
    },

    onError: (error) => {
      setPending(null);
      toast.error(error instanceof Error ? error.message : "Message didn't send.");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data, pending]);

  function submit(content: string) {
    const text = content.trim();
    if (!text || mutation.isPending) return;
    setDraft("");
    setPending(text);
    mutation.mutate(text);
  }

  const shown = messages.data ?? [];
  const empty = !activeId || (shown.length === 0 && !pending);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-6 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-6 md:self-start">
        <Button
          variant="secondary"
          className="w-full justify-start gap-2 rounded-full"
          onClick={() => setActiveId(null)}
        >
          <Plus className="size-4" /> New conversation
        </Button>
        <ScrollArea className="mt-3 max-h-[60vh]">
          <ul className="space-y-1 pr-2">
            {(conversations.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "w-full truncate rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                    activeId === c.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-3xl border border-border/70 bg-card/70 p-5">
        <div className="flex-1 space-y-4">
          {empty ? (
            <div className="py-10 text-center">
              <h1 className="text-3xl">How are you, really?</h1>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Say whatever's on your mind. No judgement, no advice you didn't ask for.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {shown.map((m) => (
                <Bubble key={m.id} role={m.role} content={m.content} at={m.created_at} />
              ))}
              {pending && <Bubble role="user" content={pending} />}
              {mutation.isPending && (
                <p className="text-sm italic text-muted-foreground">Companion is thinking…</p>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="mt-5 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            rows={2}
            placeholder="Type what's on your mind…"
            className="resize-none rounded-2xl bg-background"
          />
          <Button type="submit" size="icon" className="size-11 rounded-full" disabled={mutation.isPending}>
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Peace Companion isn't a therapist. In a crisis, contact local emergency services.
        </p>
      </section>
    </div>
  );
}

function Bubble({ role, content, at }: { role: string; content: string; at?: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg bg-secondary text-secondary-foreground",
        )}
      >
        {content}
      </div>
      {at && (
        <time className="px-2 text-[11px] text-muted-foreground" dateTime={at}>
          {new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </time>
      )}
    </div>
  );
}
