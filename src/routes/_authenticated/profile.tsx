import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Peace Companion" },
      {
        name: "description",
        content:
          "Update your display name and avatar, choose your reminders, review your activity summary and sign out.",
      },
      { property: "og:title", content: "Your profile — Peace Companion" },
      {
        property: "og:description",
        content: "Manage your Peace Companion account, reminders and appearance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

type Reminders = {
  mood_reminder: boolean;
  journal_reminder: boolean;
  activity_reminder: boolean;
};

function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email, created_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const reminders = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminder_settings")
        .select("mood_reminder, journal_reminder, activity_reminder")
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? { mood_reminder: false, journal_reminder: false, activity_reminder: false }
      );
    },
  });

  const summary = useQuery({
    queryKey: ["profile-summary"],
    queryFn: async () => {
      const [checkIns, journal, activities, conversations] = await Promise.all([
        supabase.from("check_ins").select("id", { count: "exact", head: true }),
        supabase.from("journal_entries").select("id", { count: "exact", head: true }),
        supabase.from("activity_completions").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
      ]);
      return {
        checkIns: checkIns.count ?? 0,
        journal: journal.count ?? 0,
        activities: activities.count ?? 0,
        conversations: conversations.count ?? 0,
      };
    },
  });

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setAvatarUrl(profile.data.avatar_url ?? "");
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim().slice(0, 60) || null,
          avatar_url: avatarUrl.trim() || null,
          email: user.email ?? null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save."),
  });

  const updateReminder = useMutation({
    mutationFn: async (patch: Partial<Reminders>) => {
      if (!user) throw new Error("Please sign in again.");
      const current = reminders.data ?? {
        mood_reminder: false,
        journal_reminder: false,
        activity_reminder: false,
      };
      const { error } = await supabase
        .from("reminder_settings")
        .upsert({ user_id: user.id, ...current, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't update reminders."),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const reminderRows: Array<{ key: keyof Reminders; label: string; hint: string }> = [
    { key: "mood_reminder", label: "Daily mood check-in", hint: "One gentle nudge a day, no more." },
    { key: "journal_reminder", label: "Journal reminder", hint: "A prompt to write when you have a moment." },
    { key: "activity_reminder", label: "Activity reminder", hint: "An invitation to breathe or ground yourself." },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Your profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">Only the basics — nothing sensitive.</p>

      {profile.isLoading ? (
        <Skeleton className="mt-6 h-48 rounded-3xl" />
      ) : (
        <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Your avatar"
                className="size-14 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-lg">
                {(displayName || user?.email || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName || "Add a display name"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <label className="mt-5 block text-sm" htmlFor="display-name">
            Display name
          </label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 rounded-2xl bg-background"
            placeholder="What should we call you?"
          />

          <label className="mt-4 block text-sm" htmlFor="avatar-url">
            Avatar image link
          </label>
          <Input
            id="avatar-url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="mt-1 rounded-2xl bg-background"
            placeholder="https://…"
          />

          <Button className="mt-4 rounded-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </section>
      )}

      <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
        <h2 className="text-lg">Reminders</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional, and never more than once a day.</p>
        <div className="mt-4 space-y-4">
          {reminderRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <Switch
                checked={reminders.data?.[row.key] ?? false}
                onCheckedChange={(checked) => updateReminder.mutate({ [row.key]: checked })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
        <h2 className="text-lg">Appearance</h2>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm">Dark mode</p>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
        <h2 className="text-lg">Activity summary</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xl">{summary.data?.checkIns ?? 0}</p>
            <p className="text-xs text-muted-foreground">Check-ins</p>
          </div>
          <div>
            <p className="text-xl">{summary.data?.journal ?? 0}</p>
            <p className="text-xs text-muted-foreground">Journal entries</p>
          </div>
          <div>
            <p className="text-xl">{summary.data?.activities ?? 0}</p>
            <p className="text-xs text-muted-foreground">Activities</p>
          </div>
          <div>
            <p className="text-xl">{summary.data?.conversations ?? 0}</p>
            <p className="text-xs text-muted-foreground">Conversations</p>
          </div>
        </div>
        {profile.data?.created_at && (
          <p className="mt-4 text-xs text-muted-foreground">
            Member since{" "}
            {new Date(profile.data.created_at).toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
        )}
      </section>

      <Button variant="outline" className="mt-6 rounded-full" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}
