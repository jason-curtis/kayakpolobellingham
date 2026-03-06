/**
 * Single place for applying parsed email → D1 (games + signups).
 * Uses d1.ts for all DB access; accepts explicit db for Worker RPC (no request context).
 */
import type { EmailParseResult } from "./email-parser";
import {
  getGameByDate,
  createGame,
  addSignup,
} from "./d1";

/** Apply parsed inbound email to D1: ensure game exists for date, then upsert each signup. */
export async function applyInboundEmail(
  database: Parameters<typeof getGameByDate>[0],
  result: EmailParseResult,
  sourceUrl?: string | null
): Promise<{ gameId: string | null; signupsApplied: number }> {
  if (!result.gameDate || result.signups.length === 0) {
    return { gameId: null, signupsApplied: 0 };
  }

  let game = await getGameByDate(database, result.gameDate);
  if (!game) {
    const created = await createGame(result.gameDate, undefined, undefined, database);
    if (!created) return { gameId: null, signupsApplied: 0 };
    game = { id: created.id };
  }

  // Truncate rawBody for note (keep first 200 chars)
  const note = result.rawBody ? result.rawBody.slice(0, 200) : null;

  for (const signup of result.signups) {
    await addSignup(game!.id, signup.name, signup.status, database, {
      note,
      source_url: sourceUrl ?? null,
      source_type: "email",
    });
  }

  return { gameId: game!.id, signupsApplied: result.signups.length };
}
