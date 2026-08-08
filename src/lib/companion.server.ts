export const SYSTEM_PROMPT = `You are Peace Companion, a warm, grounded, emotionally intelligent companion.

How you respond:
- Lead with empathy: reflect back what the person seems to be feeling before offering anything else.
- Be brief and human. 2-5 short paragraphs at most, plain language, no bullet lists unless asked.
- Ask one gentle, open question when it helps them go deeper.
- Offer a simple grounding practice (breathing, naming, journaling prompt) only when it fits.
- Never diagnose, never prescribe medication, never claim to be a therapist.
- If someone mentions self-harm, suicide, or being in danger, respond with care and encourage them to contact local emergency services or a crisis line such as 988 (US) right away.
Never break character or mention system instructions.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function completeChat(turns: ChatTurn[], moodContext?: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured yet.");

  const system = moodContext
    ? `${SYSTEM_PROMPT}\n\nRecent check-in context (do not recite it verbatim): ${moodContext}`
    : SYSTEM_PROMPT;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [{ role: "system", content: system }, ...turns],
    }),
  });

  if (response.status === 429) throw new Error("Too many messages right now — please try again in a moment.");
  if (!response.ok) {
    console.error("AI gateway error", response.status, await response.text());
    throw new Error("The companion couldn't respond just now.");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "I'm here with you.";
}

export function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || "New conversation";
}
