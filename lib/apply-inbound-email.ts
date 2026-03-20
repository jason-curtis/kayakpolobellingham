/**
 * Single place for applying parsed email → D1 (games + signups).
 * Uses d1.ts for all DB access; accepts explicit db for Worker RPC (no request context).
 */
import type { EmailParseResult } from "./email-parser";
import { getGameTime } from "./email-parser";
import {
  getGameByDate,
  createGame,
  addSignup,
  updateGame,
  countMidweekGamesInYear,
} from "./d1";

/** Apply parsed inbound email to D1: ensure game exists for date, then upsert each signup. */
export async function applyInboundEmail(
  database: Parameters<typeof getGameByDate>[0],
  result: EmailParseResult,
  sourceUrl?: string | null,
  sourceAt?: string | null,
  options?: { bypassDeadline?: boolean },
): Promise<{ gameId: string | null; signupsApplied: number }> {
  if (!result.gameDate) {
    return { gameId: null, signupsApplied: 0 };
  }

  // Handle cancellation: set game status to 'cancelled' if it exists
  if (result.isCancellation) {
    const game = await getGameByDate(database, result.gameDate);
    if (game) {
      await updateGame(game.id, { status: "cancelled" }, database);
      return { gameId: game.id, signupsApplied: 0 };
    }
    // Game doesn't exist yet — create it as cancelled
    const year = result.gameDate.substring(0, 4);
    const midweekCount = await countMidweekGamesInYear(database, year, result.gameDate);
    const time = getGameTime(result.gameDate, midweekCount);
    const created = await createGame(result.gameDate, time, undefined, database);
    if (created) {
      await updateGame(created.id, { status: "cancelled" }, database);
      return { gameId: created.id, signupsApplied: 0 };
    }
    return { gameId: null, signupsApplied: 0 };
  }

  if (result.signups.length === 0) {
    return { gameId: null, signupsApplied: 0 };
  }

  let game = await getGameByDate(database, result.gameDate);
  if (!game) {
    const year = result.gameDate.substring(0, 4);
    const midweekCount = await countMidweekGamesInYear(database, year, result.gameDate);
    const time = getGameTime(result.gameDate, midweekCount);
    const created = await createGame(result.gameDate, time, undefined, database);
    if (!created) return { gameId: null, signupsApplied: 0 };
    game = { id: created.id };
  }

  for (const signup of result.signups) {
    await addSignup(game!.id, signup.name, signup.status, database, {
      source_url: sourceUrl ?? null,
      source_type: "email",
      source_at: sourceAt ?? null,
    }, { bypassDeadline: options?.bypassDeadline });
  }

  return { gameId: game!.id, signupsApplied: result.signups.length };
}
