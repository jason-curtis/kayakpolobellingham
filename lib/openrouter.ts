/**
 * OpenRouter API wrapper for LLM-based date extraction fallback.
 * Uses Gemini Flash Lite 2.0 when regex fails to extract a game date.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-lite-001";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Extract just the game date via LLM when regex fails.
 * Returns null on any failure (network, parse, timeout) — callers should
 * treat this as "no LLM result" and continue with regex-only behavior.
 */
export async function llmExtractDate(
  apiKey: string,
  subject: string,
  body: string,
  referenceDate?: string,
): Promise<string | null> {
  const today = referenceDate ?? new Date().toISOString().split("T")[0];

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Extract the game date from a kayak polo email subject/body. Today is ${today}. Games are Sundays (9AM) and Wednesdays (6PM). Respond with JSON: {"game_date": "YYYY-MM-DD"} or {"game_date": null}.`,
    },
    {
      role: "user",
      content: `Subject: ${subject}\n\nBody: ${body.slice(0, 300)}`,
    },
  ];

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
        max_tokens: 50,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (typeof parsed.game_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.game_date)) {
      return parsed.game_date;
    }
    return null;
  } catch {
    return null;
  }
}
