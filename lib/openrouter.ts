/**
 * OpenRouter API wrapper for LLM-based parsing fallback.
 * Uses Gemini Flash Lite 2.0 when regex fails to extract data.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-lite-001";

export interface LLMParseResult {
  is_signup: boolean;
  game_date: string | null;
  name: string | null;
  status: "in" | "out" | "maybe" | null;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Full LLM parse: extract signup data (date, name, status) from email.
 * Used as fallback when regex parsing misses date or signups.
 * Returns null on any failure (network, parse, timeout).
 */
export async function llmParse(
  apiKey: string,
  subject: string,
  body: string,
  referenceDate?: string,
): Promise<LLMParseResult | null> {
  const today = referenceDate ?? new Date().toISOString().split("T")[0];

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You parse kayak polo signup emails. Extract structured data from the subject and body.
Today's date is ${today}. The group plays on Sunday mornings and Wednesday evenings in Bellingham, WA.

Respond with JSON only. Fields:
- is_signup: true if this is about a game signup/attendance (e.g. "I'm in" or "I'm out" or "I can be there" or "I'm a maybe" or "Joe might make it")
- game_date: the game date as YYYY-MM-DD, or null if unclear. Resolve relative dates like "next Wednesday" or "this Sunday" relative to today.
- name: the person's name if a single signup, or null if multiple/unclear
- status: "in", "out", or "maybe" if they express uncertainty, or null`,
    },
    {
      role: "user",
      content: `Subject: ${subject}\n\nBody: ${body.slice(0, 500)}`,
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
        max_tokens: 150,
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
    return {
      is_signup: !!parsed.is_signup,
      game_date: typeof parsed.game_date === "string" ? parsed.game_date : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
      status: ["in", "out", "maybe"].includes(parsed.status) ? parsed.status : null,
    };
  } catch {
    return null;
  }
}
