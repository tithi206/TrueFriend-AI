import { findMood } from "./moods";

export function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Consecutive days (counting today or yesterday as the start) that have at least one entry. */
export function streakFrom(timestamps: Array<string | Date>) {
  const days = new Set(timestamps.map((t) => dayKey(t)));
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

export function lastNDays(n: number) {
  const days: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push({
      key: dayKey(date),
      label: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    });
  }
  return days;
}

export type CheckIn = { mood_label: string; mood_score: number; created_at: string; note?: string | null };

export function moodSeries(checkIns: CheckIn[], days: number) {
  const buckets = new Map<string, number[]>();
  for (const entry of checkIns) {
    const key = dayKey(entry.created_at);
    const list = buckets.get(key) ?? [];
    list.push(entry.mood_score);
    buckets.set(key, list);
  }
  return lastNDays(days).map(({ key, label }) => {
    const scores = buckets.get(key);
    return {
      day: label,
      mood: scores && scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
      count: scores?.length ?? 0,
    };
  });
}

export function moodDistribution(checkIns: CheckIn[]) {
  const counts = new Map<string, number>();
  for (const entry of checkIns) {
    const label = findMood(entry.mood_label).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, color: findMood(label).color }))
    .sort((a, b) => b.count - a.count);
}

export function withinDays(checkIns: CheckIn[], days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return checkIns.filter((c) => new Date(c.created_at).getTime() >= cutoff);
}

/** Descriptive, non-diagnostic sentences built only from the person's own data. */
export function buildInsights(input: {
  checkIns: CheckIn[];
  journalCount7: number;
  activityCount7: number;
  conversationCount: number;
}) {
  const lines: string[] = [];
  const week = withinDays(input.checkIns, 7);
  const prevWeek = input.checkIns.filter((c) => {
    const t = new Date(c.created_at).getTime();
    const now = Date.now();
    return t < now - 7 * 864e5 && t >= now - 14 * 864e5;
  });

  const dist = moodDistribution(week);
  if (dist.length && dist[0]) {
    lines.push(`You recorded "${dist[0].label.toLowerCase()}" most often this week.`);
  } else {
    lines.push("No check-ins yet this week — a single one takes about five seconds.");
  }

  if (week.length) {
    lines.push(
      `That's ${week.length} check-in${week.length === 1 ? "" : "s"} over the last seven days.`,
    );
  }

  if (week.length && prevWeek.length) {
    const avg = (list: CheckIn[]) => list.reduce((s, c) => s + c.mood_score, 0) / list.length;
    const diff = avg(week) - avg(prevWeek);
    if (Math.abs(diff) < 0.3) lines.push("Your week looked broadly similar to the one before it.");
    else if (diff > 0) lines.push("On average your check-ins were a little brighter than last week.");
    else lines.push("Your check-ins leaned heavier than last week. Small steps still count.");
  }

  if (input.journalCount7 > 0) {
    lines.push(`You wrote ${input.journalCount7} journal entr${input.journalCount7 === 1 ? "y" : "ies"} this week.`);
  }
  if (input.activityCount7 > 0) {
    lines.push(`You finished ${input.activityCount7} calming activit${input.activityCount7 === 1 ? "y" : "ies"} this week.`);
  }
  if (input.conversationCount > 0) {
    lines.push(`You've started ${input.conversationCount} conversation${input.conversationCount === 1 ? "" : "s"} with your companion so far.`);
  }

  return lines;
}
