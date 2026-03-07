// Single owner for all D1 access: games, signups, regulars.
// Callers can pass an explicit db (e.g. from Worker RPC) or omit to use request context (Next).
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** D1 database binding (avoids pulling in @cloudflare/workers-types in Next build). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1 = any;

const PACIFIC_TZ = "America/Los_Angeles";

/** Parse a naive datetime string as Pacific time. Strings with timezone info pass through. */
export function parsePacific(datetime: string): Date {
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(datetime)) return new Date(datetime);
  // Get Pacific UTC offset at this approximate date using Intl
  const approx = new Date(datetime + "Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(approx);
  const tz = parts.find((p) => p.type === "timeZoneName");
  const m = tz?.value?.match(/GMT([+-]\d{2}:\d{2})/);
  return new Date(datetime + (m ? m[1] : "-08:00"));
}

async function getDB(): Promise<D1> {
  const { env } = await getCloudflareContext();
  return (env as { D1_DB: D1 }).D1_DB;
}

async function db(dbOrNull: D1 | null | undefined): Promise<D1> {
  return dbOrNull ?? (await getDB());
}

// ── Games ──────────────────────────────────────────────────────────────────

export async function getGames(database?: D1 | null): Promise<any[]> {
  const d = await db(database);
  const { results } = await d.prepare("SELECT * FROM games ORDER BY date DESC").all();
  return results;
}

export async function getGamesPaginated(
  page: number,
  limit: number,
  database?: D1 | null
): Promise<{ games: any[]; total: number }> {
  const d = await db(database);
  const offset = (page - 1) * limit;
  const countRow = await d.prepare("SELECT COUNT(*) as count FROM games").first();
  const total = (countRow as any).count;
  const { results } = await d
    .prepare("SELECT * FROM games ORDER BY date DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all();
  return { games: results as any[], total };
}

export async function getGameByDate(database: D1 | null | undefined, date: string): Promise<{ id: string } | null> {
  const d = await db(database);
  return d.prepare("SELECT id FROM games WHERE date = ?").bind(date).first() as Promise<{ id: string } | null>;
}

export async function getUpcomingAndRecentGames(database?: D1 | null): Promise<{ upcoming: any | null; recent: any | null }> {
  const d = await db(database);
  const today = new Date().toISOString().split("T")[0];
  const upcoming = await d.prepare(
    "SELECT * FROM games WHERE date >= ? AND status != 'completed' ORDER BY date ASC LIMIT 1"
  ).bind(today).first();
  const recent = await d.prepare("SELECT * FROM games WHERE date <= ? ORDER BY date DESC LIMIT 1").bind(today).first();
  return { upcoming, recent };
}

export async function getHomeGames(database?: D1 | null): Promise<any[]> {
  const d = await db(database);
  const today = new Date().toISOString().split("T")[0];
  const { results: upcoming } = await d.prepare(
    "SELECT * FROM games WHERE date >= ? ORDER BY date ASC LIMIT 2"
  ).bind(today).all();
  const { results: recent } = await d.prepare(
    "SELECT * FROM games WHERE date < ? ORDER BY date DESC LIMIT 1"
  ).bind(today).all();
  return [...(upcoming as any[]), ...(recent as any[])];
}

export async function getMoreGames(offset: number, limit: number, database?: D1 | null): Promise<{ games: any[]; hasMore: boolean }> {
  const d = await db(database);
  const { results } = await d.prepare(
    "SELECT * FROM games ORDER BY date DESC LIMIT ? OFFSET ?"
  ).bind(limit + 1, offset).all();
  const games = results as any[];
  const hasMore = games.length > limit;
  return { games: games.slice(0, limit), hasMore };
}

export async function getGame(id: string, database?: D1 | null) {
  const d = await db(database);
  return d.prepare("SELECT * FROM games WHERE id = ?").bind(id).first();
}

const DEFAULT_GAME_TIME = "09:00";

/** Count midweek games (Mon-Fri) in a given year before a given date. */
export async function countMidweekGamesInYear(
  database: D1 | null | undefined,
  year: string,
  beforeDate: string,
): Promise<number> {
  const d = await db(database);
  const row = await d
    .prepare(
      `SELECT COUNT(*) as count FROM games
       WHERE date >= ? AND date < ? AND date < ?
       AND CAST(strftime('%w', date) AS INTEGER) NOT IN (0, 6)`
    )
    .bind(`${year}-01-01`, `${parseInt(year) + 1}-01-01`, beforeDate)
    .first();
  return (row as any)?.count ?? 0;
}

export async function createGame(
  date: string,
  time?: string,
  signup_deadline?: string,
  database?: D1 | null
): Promise<{ id: string } | null> {
  const d = await db(database);
  const id = `game-${Date.now()}`;
  const now = new Date().toISOString();
  const deadline =
    signup_deadline ??
    new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { results } = await d
    .prepare(
      "INSERT INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind(id, date, time ?? DEFAULT_GAME_TIME, deadline, "open", now, now)
    .all();
  return (results as any[])[0] ?? null;
}

export async function updateGame(id: string, updates: Record<string, any>, database?: D1 | null) {
  const d = await db(database);
  const now = new Date().toISOString();
  const keys = Object.keys(updates);
  const fields = keys.map((k) => `${k} = ?`).join(", ");
  const values = Object.values(updates);
  const { results } = await d
    .prepare(`UPDATE games SET ${fields}, updated_at = ? WHERE id = ? RETURNING *`)
    .bind(...values, now, id)
    .all();
  return (results as any[])[0] ?? null;
}

export async function deleteGame(id: string, database?: D1 | null): Promise<boolean> {
  const d = await db(database);
  await d.prepare("DELETE FROM signups WHERE game_id = ?").bind(id).run();
  const { results } = await d.prepare("DELETE FROM games WHERE id = ? RETURNING id").bind(id).all();
  return (results as any[]).length > 0;
}

// ── Resolve player name (regulars + aliases) ──────────────────────────────────

export async function resolvePlayerName(inputName: string, database?: D1 | null): Promise<string> {
  const d = await db(database);
  const { results } = await d.prepare("SELECT name, aliases FROM regulars").all();
  const trimmed = inputName.trim();
  for (const r of (results as { name: string; aliases: string | null }[])) {
    if (r.name.toLowerCase() === trimmed.toLowerCase()) return r.name;
    const aliases: string[] = r.aliases ? JSON.parse(r.aliases) : [];
    if (aliases.some((a: string) => a.toLowerCase() === trimmed.toLowerCase())) return r.name;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// ── Signups ──────────────────────────────────────────────────────────────────

export async function getSignupsForGame(gameId: string, database?: D1 | null) {
  const d = await db(database);
  const { results } = await d.prepare("SELECT * FROM signups WHERE game_id = ?").bind(gameId).all();
  const mapSignup = (s: any) => ({
    name: s.player_name,
    late: !!s.late,
    note: s.note ?? null,
    source_url: s.source_url ?? null,
    source_type: s.source_type ?? null,
  });
  return {
    in: (results as any[]).filter((s) => s.status === "in").map(mapSignup),
    out: (results as any[]).filter((s) => s.status === "out").map(mapSignup),
    maybe: (results as any[]).filter((s) => s.status === "maybe").map(mapSignup),
  };
}

export interface SignupSource {
  note?: string | null;
  source_url?: string | null;
  source_type?: "email" | "site" | null;
  source_at?: string | null;
}

export async function addSignup(
  gameId: string,
  playerName: string,
  status: "in" | "out" | "maybe",
  database?: D1 | null,
  source?: SignupSource
): Promise<{ success: boolean; results?: any }> {
  const d = await db(database);
  const now = new Date().toISOString();
  const resolvedName = await resolvePlayerName(playerName, d);

  const game = (await d.prepare("SELECT date, time, signup_deadline FROM games WHERE id = ?").bind(gameId).first()) as {
    date: string;
    time: string;
    signup_deadline: string;
  } | null;
  if (game?.date && game?.time) {
    const gameStart = parsePacific(`${game.date}T${game.time}`);
    if (new Date(now) >= gameStart) {
      throw new Error("Game has already started — signups are closed");
    }
  }

  // Use original message time (source_at) for email/poller signups, current time for site signups
  const signupTime = source?.source_at ? new Date(source.source_at) : new Date(now);
  const isLate = game?.signup_deadline ? signupTime > parsePacific(game.signup_deadline) : false;
  const note = source?.note ?? null;
  const sourceUrl = source?.source_url ?? null;
  const sourceType = source?.source_type ?? null;
  const sourceAt = source?.source_at ?? now;
  const existing = await d
    .prepare("SELECT id FROM signups WHERE game_id = ? AND player_name = ?")
    .bind(gameId, resolvedName)
    .first();

  if (existing) {
    const { results } = await d
      .prepare(
        "UPDATE signups SET status = ?, late = ?, note = ?, source_url = ?, source_type = ?, source_at = ?, updated_at = ? WHERE game_id = ? AND player_name = ? RETURNING *"
      )
      .bind(status, isLate ? 1 : 0, note, sourceUrl, sourceType, sourceAt, now, gameId, resolvedName)
      .all();
    return { success: true, results };
  }
  const id = `sig-${Date.now()}`;
  const { results } = await d
    .prepare(
      "INSERT INTO signups (id, game_id, player_name, status, late, note, source_url, source_type, source_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind(id, gameId, resolvedName, status, isLate ? 1 : 0, note, sourceUrl, sourceType, sourceAt, now, now)
    .all();
  return { success: true, results };
}

// ── Regulars ──────────────────────────────────────────────────────────────────

export async function getRegulars(database?: D1 | null): Promise<any[]> {
  const d = await db(database);
  const { results } = await d.prepare("SELECT * FROM regulars ORDER BY name ASC").all();
  return (results as any[]).map((r) => ({
    ...r,
    aliases: r.aliases ? JSON.parse(r.aliases) : [],
  }));
}

export async function getRegular(id: string, database?: D1 | null) {
  const d = await db(database);
  const regular = (await d.prepare("SELECT * FROM regulars WHERE id = ?").bind(id).first()) as any;
  if (!regular) return null;
  return { ...regular, aliases: regular.aliases ? JSON.parse(regular.aliases) : [] };
}

export async function createRegular(name: string, aliases: string[] = [], database?: D1 | null) {
  const d = await db(database);
  const id = `reg-${Date.now()}`;
  const now = new Date().toISOString();
  const { results } = await d
    .prepare("INSERT INTO regulars (id, name, aliases, created_at) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(id, name, JSON.stringify(aliases), now)
    .all();
  const regular = (results as any[])[0];
  if (!regular) return null;
  return { ...regular, aliases: JSON.parse(regular.aliases || "[]") };
}

export async function updateRegular(
  id: string,
  name?: string,
  aliases?: string[],
  database?: D1 | null
) {
  const d = await db(database);
  const updates: Record<string, any> = {};
  if (name) updates.name = name;
  if (aliases) updates.aliases = JSON.stringify(aliases);
  if (Object.keys(updates).length === 0) return null;
  const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
  const values = Object.values(updates);
  const { results } = await d.prepare(`UPDATE regulars SET ${fields} WHERE id = ? RETURNING *`).bind(...values, id).all();
  const regular = (results as any[])[0];
  if (!regular) return null;
  return { ...regular, aliases: JSON.parse(regular.aliases || "[]") };
}

export async function deleteRegular(id: string, database?: D1 | null): Promise<boolean> {
  const d = await db(database);
  const { results } = await d.prepare("DELETE FROM regulars WHERE id = ? RETURNING id").bind(id).all();
  return (results as any[]).length > 0;
}
