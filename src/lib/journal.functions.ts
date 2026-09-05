import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reflectOnText } from "./companion.server";

export const reflectOnEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ entryId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS keeps this scoped to the signed-in user's own entries.
    const { data: entry, error } = await supabase
      .from("journal_entries")
      .select("title, content")
      .eq("id", data.entryId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!entry) throw new Error("That entry couldn't be found.");

    const reflection = await reflectOnText(entry.title, entry.content.slice(0, 6000));
    return { reflection };
  });
