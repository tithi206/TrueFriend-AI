export type Mood = {
  label: string;
  emoji: string;
  score: number;
  color: string;
};

/** The eight moods a person can pick during a check-in. */
export const MOODS: Mood[] = [
  { label: "Happy", emoji: "😊", score: 5, color: "var(--chart-2)" },
  { label: "Calm", emoji: "😌", score: 5, color: "var(--chart-1)" },
  { label: "Okay", emoji: "⛅", score: 3, color: "var(--chart-3)" },
  { label: "Tired", emoji: "😴", score: 3, color: "var(--chart-4)" },
  { label: "Anxious", emoji: "😟", score: 2, color: "var(--chart-5)" },
  { label: "Stressed", emoji: "😣", score: 2, color: "var(--chart-5)" },
  { label: "Sad", emoji: "😢", score: 2, color: "var(--chart-3)" },
  { label: "Angry", emoji: "😠", score: 1, color: "var(--destructive)" },
];

export const MOOD_LABELS = MOODS.map((m) => m.label);

const LEGACY: Record<string, string> = {
  struggling: "Sad",
  low: "Sad",
  good: "Happy",
  peaceful: "Calm",
};

export function findMood(label: string | null | undefined): Mood {
  const key = (label ?? "").trim().toLowerCase();
  const mapped = LEGACY[key] ?? label ?? "";
  return (
    MOODS.find((m) => m.label.toLowerCase() === mapped.toString().trim().toLowerCase()) ?? {
      label: label || "Unknown",
      emoji: "•",
      score: 3,
      color: "var(--muted-foreground)",
    }
  );
}

export function moodEmoji(label: string | null | undefined) {
  return findMood(label).emoji;
}
