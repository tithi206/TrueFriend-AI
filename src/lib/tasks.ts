import { dayKey, lastNDays } from "./insights";

export type Priority = "low" | "medium" | "high";
export type Category = "study" | "college" | "personal" | "other";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  category: string;
  estimated_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "study", label: "Study" },
  { id: "college", label: "College" },
  { id: "personal", label: "Personal" },
  { id: "other", label: "Other" },
];

export const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function todayKey() {
  return dayKey(new Date());
}

export function isToday(task: Task) {
  return !!task.due_date && task.due_date === todayKey();
}

export function isOverdue(task: Task) {
  return !task.completed_at && !!task.due_date && task.due_date < todayKey();
}

export function dueLabel(task: Task) {
  if (!task.due_date) return "No due date";
  const key = todayKey();
  if (task.due_date === key) return "Due today";
  if (task.due_date < key) return "Overdue";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (task.due_date === dayKey(tomorrow)) return "Due tomorrow";
  return `Due ${new Date(`${task.due_date}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`;
}

/** Higher score = more useful to do next. */
export function urgencyScore(task: Task) {
  let score = (PRIORITY_WEIGHT[task.priority] ?? 1) * 10;
  if (isOverdue(task)) score += 40;
  else if (isToday(task)) score += 25;
  else if (task.due_date) {
    const days = Math.max(
      0,
      Math.round((new Date(`${task.due_date}T12:00:00`).getTime() - Date.now()) / 864e5),
    );
    score += Math.max(0, 18 - days * 2);
  }
  if (task.estimated_minutes && task.estimated_minutes <= 20) score += 4;
  return score;
}

export function pickNextTask(tasks: Task[]) {
  const open = tasks.filter((t) => !t.completed_at);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => urgencyScore(b) - urgencyScore(a))[0] ?? null;
}

export function planDay(tasks: Task[]) {
  const open = [...tasks.filter((t) => !t.completed_at)].sort(
    (a, b) => urgencyScore(b) - urgencyScore(a),
  );
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dayKey(tomorrow);

  const today: Task[] = [];
  const next: Task[] = [];
  const later: Task[] = [];

  for (const task of open) {
    if (isOverdue(task) || isToday(task) || task.priority === "high") today.push(task);
    else if (task.due_date === tomorrowKey) next.push(task);
    else later.push(task);
  }
  return { today, tomorrow: next, upcoming: later };
}

/** Tasks completed per day for the last n days. */
export function completionSeries(tasks: Task[], days: number) {
  return lastNDays(days).map(({ key, label }) => ({
    day: label,
    completed: tasks.filter((t) => t.completed_at && dayKey(t.completed_at) === key).length,
  }));
}

/** Consecutive days ending today/yesterday with at least one completed task. */
export function completionStreak(tasks: Task[]) {
  const days = new Set(
    tasks.filter((t) => t.completed_at).map((t) => dayKey(t.completed_at as string)),
  );
  if (days.size === 0) return 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildSuggestions(tasks: Task[]) {
  const out: string[] = [];
  const open = tasks.filter((t) => !t.completed_at);
  const overdue = open.filter(isOverdue);
  const today = open.filter(isToday);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = dayKey(tomorrowDate);
  const dueTomorrow = open.filter((t) => t.due_date === tomorrowKey);
  const completedToday = tasks.filter(
    (t) => t.completed_at && dayKey(t.completed_at) === todayKey(),
  ).length;
  const quick = open.filter((t) => t.estimated_minutes && t.estimated_minutes <= 20);

  if (overdue.length) {
    out.push(
      `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}. Want to move ${overdue.length === 1 ? "it" : "one" } to today? 🤍`,
    );
  }
  if (dueTomorrow.length >= 2) {
    out.push(`${dueTomorrow.length} tasks are due tomorrow. Start with the highest-priority one.`);
  }
  if (quick.length >= 2) {
    out.push("You have a few small tasks. Try finishing one in the next 15 minutes ⏱️");
  }
  if (today.length && completedToday >= today.length) {
    out.push("Nice! You've cleared everything you planned for today ✨");
  } else if (completedToday > 0) {
    out.push(`${completedToday} done today — that counts. Small steps add up.`);
  }
  if (!open.length && tasks.length) out.push("Your list is clear. Enjoy the quiet 🌿");
  if (!tasks.length) out.push("Add your first task and I'll help you decide what to do next.");
  return out.slice(0, 4);
}

/** Descriptive, non-diagnostic mood/productivity observation. Null unless enough data. */
export function moodProductivityInsight(
  tasks: Task[],
  checkIns: { mood_score: number; created_at: string }[],
) {
  const byDay = new Map<string, { scores: number[]; done: number }>();
  for (const c of checkIns) {
    const key = dayKey(c.created_at);
    const bucket = byDay.get(key) ?? { scores: [], done: 0 };
    bucket.scores.push(c.mood_score);
    byDay.set(key, bucket);
  }
  for (const t of tasks) {
    if (!t.completed_at) continue;
    const key = dayKey(t.completed_at);
    const bucket = byDay.get(key);
    if (bucket) bucket.done += 1;
  }

  const rows = [...byDay.values()].filter((b) => b.scores.length);
  if (rows.length < 5) return null;

  const avgMood = (b: { scores: number[] }) => b.scores.reduce((s, v) => s + v, 0) / b.scores.length;
  const overall = rows.reduce((s, b) => s + avgMood(b), 0) / rows.length;
  const brighter = rows.filter((b) => avgMood(b) >= overall);
  const heavier = rows.filter((b) => avgMood(b) < overall);
  if (!brighter.length || !heavier.length) return null;

  const avgDone = (list: typeof rows) => list.reduce((s, b) => s + b.done, 0) / list.length;
  const diff = avgDone(brighter) - avgDone(heavier);
  if (Math.abs(diff) < 0.4) {
    return "Your task completion looked fairly steady across brighter and heavier check-in days.";
  }
  return diff > 0
    ? "You completed more tasks on days when your check-in was more positive."
    : "You completed more tasks on your heavier days — be kind to yourself about pacing.";
}
