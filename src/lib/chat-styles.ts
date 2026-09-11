export const CHAT_STYLES = [
  {
    id: "friend",
    emoji: "🫂",
    label: "Supportive Friend",
    hint: "Warm, casual, chatty",
  },
  {
    id: "listener",
    emoji: "🌿",
    label: "Gentle Listener",
    hint: "Quiet, calm, few words",
  },
  {
    id: "motivator",
    emoji: "✨",
    label: "Cheerful Motivator",
    hint: "Upbeat little nudges",
  },
  {
    id: "practical",
    emoji: "🧭",
    label: "Practical Guide",
    hint: "One small next step",
  },
] as const;

export type ChatStyleId = (typeof CHAT_STYLES)[number]["id"];

export const DEFAULT_CHAT_STYLE: ChatStyleId = "friend";

export const CHAT_STYLE_IDS = CHAT_STYLES.map((s) => s.id) as unknown as [ChatStyleId, ...ChatStyleId[]];

export function findChatStyle(id?: string | null) {
  return CHAT_STYLES.find((s) => s.id === id) ?? CHAT_STYLES[0];
}
