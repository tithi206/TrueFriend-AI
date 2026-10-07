import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BellRing, CalendarDays, Check, Clock, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSuggestions,
  CATEGORIES,
  completionSeries,
  completionStreak,
  dueLabel,
  isOverdue,
  isToday,
  moodProductivityInsight,
  pickNextTask,
  planDay,
  PRIORITIES,
  PRIORITY_WEIGHT,
  todayKey,
  type Category,
  type Priority,
  type Task,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/productivity")({
  head: () => ({
    meta: [
      { title: "Productivity & tasks — Peace Companion" },
      {
        name: "description",
        content:
          "A calm private to-do list with priorities, due dates, weekly completion charts, streaks and gentle suggestions on what to do next.",
      },
      { property: "og:title", content: "Productivity & tasks — Peace Companion" },
      {
        property: "og:description",
        content: "Plan your day, track completed tasks and see what to do next — private to you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductivityPage,
});

type Filter = "today" | "upcoming" | "completed" | "all";
type SortBy = "priority" | "due";
type ReminderPreferences = {
  enabled: boolean;
  upcoming: boolean;
  overdue: boolean;
  highPriority: boolean;
};

const DEFAULT_REMINDERS: ReminderPreferences = {
  enabled: false,
  upcoming: true,
  overdue: true,
  highPriority: true,
};

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyDraft = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium" as Priority,
  category: "study" as Category,
  estimated_minutes: "",
};

function ProductivityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("today");
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [term, setTerm] = useState("");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [showPlan, setShowPlan] = useState(false);
  const [reminders, setReminders] = useState<ReminderPreferences>(DEFAULT_REMINDERS);
  const [reminderOwnerId, setReminderOwnerId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, due_date, priority, category, estimated_minutes, completed_at, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const moodQuery = useQuery({
    queryKey: ["tasks-mood"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("mood_score, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  useEffect(() => {
    if (!user?.id) {
      setReminderOwnerId(null);
      setReminders(DEFAULT_REMINDERS);
      return;
    }
    const key = `peace-task-reminders:${user.id}`;
    try {
      const stored = window.localStorage.getItem(key);
      const parsed = stored ? JSON.parse(stored) as Partial<ReminderPreferences> : {};
      setReminders({
        enabled: parsed.enabled === true,
        upcoming: parsed.upcoming !== false,
        overdue: parsed.overdue !== false,
        highPriority: parsed.highPriority !== false,
      });
    } catch {
      setReminders(DEFAULT_REMINDERS);
    }
    setReminderOwnerId(user.id);
    setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
  }, [user?.id]);

  function saveReminderPreferences(next: ReminderPreferences) {
    setReminders(next);
    if (!user?.id) return;
    try {
      window.localStorage.setItem(`peace-task-reminders:${user.id}`, JSON.stringify(next));
    } catch {
      toast.error("Reminder settings couldn't be saved on this device.");
    }
  }

  async function toggleReminders() {
    if (reminders.enabled) {
      saveReminderPreferences({ ...reminders, enabled: false });
      return;
    }
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      toast.error("Browser notifications aren't available here.");
      return;
    }
    const permission = window.Notification.permission === "default"
      ? await window.Notification.requestPermission()
      : window.Notification.permission;
    setNotificationPermission(permission);
    if (permission === "granted") {
      saveReminderPreferences({ ...reminders, enabled: true });
    } else if (permission === "denied") {
      toast.error("Notifications are blocked in your browser settings.");
    }
  }

  useEffect(() => {
    if (!user?.id || reminderOwnerId !== user.id || !reminders.enabled || notificationPermission !== "granted") return;
    const checkReminders = () => {
      if (window.Notification.permission !== "granted") return;
      const today = todayKey();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowKey = localDayKey(tomorrow);
      const open = tasks.filter((task) => !task.completed_at);
      const categories = [
        { id: "upcoming", active: reminders.upcoming && open.some((task) => task.due_date === today || task.due_date === tomorrowKey), body: "A task is due today or tomorrow. Open Productivity to review your list." },
        { id: "overdue", active: reminders.overdue && open.some(isOverdue), body: "You have an overdue task. Open Productivity when you're ready to review it." },
        { id: "high-priority", active: reminders.highPriority && open.some((task) => task.priority === "high"), body: "You have a high-priority task waiting. Open Productivity to take a look." },
      ];
      const sentKey = `peace-task-reminders-sent:${user.id}`;
      let sent: Record<string, string> = {};
      try {
        const stored = window.localStorage.getItem(sentKey);
        sent = stored ? JSON.parse(stored) as Record<string, string> : {};
      } catch {
        sent = {};
      }
      let changed = false;
      for (const category of categories) {
        if (!category.active || sent[category.id] === today) continue;
        try {
          const notification = new window.Notification("Peace Companion", {
            body: category.body,
            tag: `peace-task-reminder-${category.id}`,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
          sent[category.id] = today;
          changed = true;
        } catch {
          // Notification permission can change while the page is open.
        }
      }
      if (changed) {
        try {
          window.localStorage.setItem(sentKey, JSON.stringify(sent));
        } catch {
          // Reminders remain usable if this device cannot persist notification history.
        }
      }
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 60_000);
    return () => window.clearInterval(timer);
  }, [tasks, user?.id, reminderOwnerId, reminders, notificationPermission]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const save = useMutation({
    mutationFn: async () => {
      const title = draft.title.trim();
      if (!title) throw new Error("Give the task a title.");
      const minutes = draft.estimated_minutes ? Number(draft.estimated_minutes) : null;
      if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) {
        throw new Error("Estimated time should be between 1 and 1440 minutes.");
      }
      const payload = {
        title: title.slice(0, 160),
        description: draft.description.trim() || null,
        due_date: draft.due_date || null,
        priority: draft.priority,
        category: draft.category,
        estimated_minutes: minutes,
      };

      if (editingId) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", editingId);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("tasks").insert({ ...payload, user_id: auth.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "Task updated." : "Task added.");
      setDraft(emptyDraft);
      setComposing(false);
      setEditingId(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save."),
  });

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase
        .from("tasks")
        .update({ completed_at: task.completed_at ? null : new Date().toISOString() })
        .eq("id", task.id);
      if (error) throw error;
      return task;
    },
    onSuccess: (task) => {
      if (!task.completed_at) toast.success("Done — small steps count 🌿");
      refresh();
    },
    onError: () => toast.error("Couldn't update that task."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task deleted.");
      refresh();
    },
    onError: () => toast.error("Couldn't delete that task."),
  });

  function startEdit(task: Task) {
    setEditingId(task.id);
    setComposing(true);
    setDraft({
      title: task.title,
      description: task.description ?? "",
      due_date: task.due_date ?? "",
      priority: (task.priority as Priority) ?? "medium",
      category: (task.category as Category) ?? "other",
      estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : "",
    });
  }

  const visible = useMemo(() => {
    const clean = term.trim().toLowerCase();
    let list = tasks.filter((task) => {
      if (filter === "completed") return !!task.completed_at;
      if (filter === "today") return !task.completed_at && (isToday(task) || isOverdue(task));
      if (filter === "upcoming")
        return !task.completed_at && !!task.due_date && task.due_date > todayKey();
      return true;
    });
    if (clean) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(clean) ||
          (t.description ?? "").toLowerCase().includes(clean),
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === "priority") {
        const diff = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
        if (diff !== 0) return diff;
      }
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    });
  }, [tasks, filter, term, sortBy]);

  const openTasks = tasks.filter((t) => !t.completed_at);
  const completed = tasks.filter((t) => t.completed_at);
  const dueToday = openTasks.filter((t) => isToday(t) || isOverdue(t));
  const rate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  const streak = completionStreak(tasks);
  const next = pickNextTask(tasks);
  const suggestions = buildSuggestions(tasks);
  const plan = planDay(tasks);
  const weekly = completionSeries(tasks, 7);
  const split = [
    { name: "Completed", value: completed.length, color: "var(--primary)" },
    { name: "Pending", value: openTasks.length, color: "var(--chart-4)" },
  ].filter((s) => s.value > 0);
  const moodLink = moodProductivityInsight(tasks, moodQuery.data ?? []);

  const stats = [
    { label: "Tasks today", value: String(dueToday.length) },
    { label: "Completed", value: String(completed.length) },
    { label: "Pending", value: String(openTasks.length) },
    { label: "Completion rate", value: `${rate}%` },
    { label: "Streak", value: streak ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Productivity</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your private task list — gentle structure, no pressure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setShowPlan((v) => !v)}
          >
            <CalendarDays className="mr-1 size-4" /> Plan my day
          </Button>
          <Button
            className="rounded-full"
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft);
              setComposing((v) => !v);
            }}
          >
            <Plus className="mr-1 size-4" /> Add task
          </Button>
        </div>
      </div>

      {tasksQuery.isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-3xl border border-border/70 bg-card/70 p-4 transition-colors hover:border-primary/40"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-2 text-xl">{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="mt-4 rounded-3xl border border-primary/30 bg-secondary/50 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              What should I do next?
            </p>
            {next ? (
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-lg">{next.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {PRIORITIES.find((p) => p.id === next.priority)?.label ?? next.priority} priority
                    {" • "}
                    {dueLabel(next)}
                    {next.estimated_minutes ? ` • ${next.estimated_minutes} min` : ""}
                  </p>
                </div>
                <Button
                  className="rounded-full"
                  onClick={() => toggle.mutate(next)}
                  disabled={toggle.isPending}
                >
                  <Check className="mr-1 size-4" /> Start task
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing pending. Add a task when you're ready.
              </p>
            )}
          </section>

          {suggestions.length > 0 && (
            <section className="mt-4 rounded-3xl border border-border/70 bg-card/70 p-5">
              <h2 className="flex items-center gap-2 text-lg">
                <Sparkles className="size-4 text-primary" /> Suggestions for you
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {suggestions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {moodLink && (
                <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
                  {moodLink}
                </p>
              )}
            </section>
          )}

          {showPlan && (
            <section className="mt-4 rounded-3xl border border-border/70 bg-card/70 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg">Your day, roughly planned</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Close plan"
                  onClick={() => setShowPlan(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Just a suggestion — nothing on your list was changed.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["Today", plan.today],
                    ["Tomorrow", plan.tomorrow],
                    ["Upcoming", plan.upcoming],
                  ] as const
                ).map(([label, list]) => (
                  <div key={label} className="rounded-2xl border border-border/60 bg-background p-4">
                    <p className="text-sm font-medium">{label}</p>
                    {list.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">Nothing here.</p>
                    ) : (
                      <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        {list.slice(0, 6).map((task) => (
                          <li key={task.id} className="truncate">
                            {task.title}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <section className="rounded-3xl border border-border/70 bg-card/70 p-5 lg:col-span-3">
              <h2 className="text-lg">Completed this week</h2>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="completed" name="Completed" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-3xl border border-border/70 bg-card/70 p-5 lg:col-span-2">
              <h2 className="text-lg">Completed vs pending</h2>
              {split.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No tasks yet.</p>
              ) : (
                <div className="mt-4 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={split} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%">
                        {split.map((slice) => (
                          <Cell key={slice.name} fill={slice.color} stroke="var(--card)" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {composing && (
        <div className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5">
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="What needs doing?"
            className="rounded-2xl bg-background"
          />
          <Textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={3}
            placeholder="Optional details"
            className="mt-3 resize-none rounded-2xl bg-background"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-muted-foreground">
              Due date
              <Input
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                className="mt-1 rounded-2xl bg-background"
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Estimated time (minutes)
              <Input
                type="number"
                min={1}
                max={1440}
                value={draft.estimated_minutes}
                onChange={(e) => setDraft({ ...draft, estimated_minutes: e.target.value })}
                placeholder="30"
                className="mt-1 rounded-2xl bg-background"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                onClick={() => setDraft({ ...draft, priority: p.id })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  draft.priority === p.id
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setDraft({ ...draft, category: c.id })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  draft.category === c.id
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="rounded-full" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update task" : "Save task"}
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setComposing(false);
                setEditingId(null);
                setDraft(emptyDraft);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["today", "upcoming", "completed", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm capitalize transition-colors",
              filter === f
                ? "border-primary bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {f}
          </button>
        ))}
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search tasks"
            className="rounded-full bg-background pl-9"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="priority">Sort by priority</option>
          <option value="due">Sort by due date</option>
        </select>
      </div>

      {tasksQuery.isError ? (
        <p className="mt-6 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Couldn't load your tasks. Please try again in a moment.
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {tasks.length === 0
            ? "No tasks yet — add one small thing you'd like to finish today."
            : "Nothing here right now."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((task) => (
            <li
              key={task.id}
              className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40"
            >
              <button
                onClick={() => toggle.mutate(task)}
                aria-label={task.completed_at ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  task.completed_at
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary",
                )}
              >
                {task.completed_at && <Check className="size-3" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate", task.completed_at && "text-muted-foreground line-through")}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      task.priority === "high" && "border-primary/50 text-foreground",
                    )}
                  >
                    {PRIORITIES.find((p) => p.id === task.priority)?.label ?? task.priority}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                    {task.category}
                  </span>
                  <span className={cn(isOverdue(task) && "text-foreground")}>{dueLabel(task)}</span>
                  {task.estimated_minutes && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {task.estimated_minutes} min
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Edit task"
                  onClick={() => startEdit(task)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Delete task"
                  onClick={() => remove.mutate(task.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
