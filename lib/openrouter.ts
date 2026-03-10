/**
 * OpenRouter API wrapper for LLM-based parsing fallback.
 * Uses Gemini Flash Lite 2.0 when regex fails to extract data.
 */

import { logger } from "./logger";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-lite-001";

export interface LLMParseResult {
  is_signup: boolean;
  game_date: string | null;
  name: string | null;
  status: "in" | "out" | "maybe" | null;
}

/** Extended result for debug views — includes error/diagnostic info */
export interface LLMDebugResult {
  result: LLMParseResult | null;
  error: string | null;
  raw_response: string | null;
  model: string;
  latency_ms: number;
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
  const debug = await llmParseDebug(apiKey, subject, body, referenceDate);
  return debug.result;
}

/**
 * LLM parse with full diagnostic info. Used by debug endpoint.
 */
export async function llmParseDebug(
  apiKey: string,
  subject: string,
  body: string,
  referenceDate?: string,
): Promise<LLMDebugResult> {
  const start = Date.now();
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

    const latency = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const error = `OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`;
      logger.warn({ event: "llm_parse_error", status: res.status, error }, "LLM fallback HTTP error");
      return { result: null, error, raw_response: errText.slice(0, 500), model: MODEL, latency_ms: latency };
    }

    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (json.error) {
      const error = `OpenRouter API error: ${json.error.message}`;
      logger.warn({ event: "llm_parse_error", error }, "LLM fallback API error");
      return { result: null, error, raw_response: JSON.stringify(json).slice(0, 500), model: MODEL, latency_ms: latency };
    }

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      const error = "No content in LLM response";
      logger.warn({ event: "llm_parse_error", error, json: JSON.stringify(json).slice(0, 200) }, "LLM empty response");
      return { result: null, error, raw_response: JSON.stringify(json).slice(0, 500), model: MODEL, latency_ms: latency };
    }

    const parsed = JSON.parse(content);
    const result: LLMParseResult = {
      is_signup: !!parsed.is_signup,
      game_date: typeof parsed.game_date === "string" ? parsed.game_date : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
      status: ["in", "out", "maybe"].includes(parsed.status) ? parsed.status : null,
    };

    logger.info({ event: "llm_parse_ok", result, latency_ms: latency }, "LLM fallback succeeded");
    return { result, error: null, raw_response: content, model: MODEL, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "llm_parse_error", error, latency_ms: latency }, "LLM fallback exception");
    return { result: null, error, raw_response: null, model: MODEL, latency_ms: latency };
  }
}
