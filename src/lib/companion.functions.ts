import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { completeChat, titleFrom } from "./companion.server";

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        content: z.string().min(1).max(4000),
        style: z.enum(["friend", "listener", "motivator", "practical"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let conversationId = data.conversationId ?? null;

    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title: titleFrom(data.content) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = created.id;
    }

    const { error: userMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: data.content,
    });
    if (userMsgError) throw new Error(userMsgError.message);

    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30);

    const { data: latestCheckIn } = await supabase
      .from("check_ins")
      .select("mood_label, mood_score, note")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const moodContext = latestCheckIn
      ? `mood "${latestCheckIn.mood_label}" (${latestCheckIn.mood_score}/5)${latestCheckIn.note ? `, journal note: ${latestCheckIn.note}` : ""}`
      : undefined;

    const reply = await completeChat(
      (history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      moodContext,
    );

    const { error: replyError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    if (replyError) throw new Error(replyError.message);

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return { conversationId, reply };
  });
