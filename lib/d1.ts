// D1 Database Operations via native Cloudflare binding
import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getDB() {
  const { env } = await getCloudflareContext();
  return (env as any).D1_DB;
}

// Games
export async function getGames(): Promise<any[]> {
  const db = await getDB();
  const { results } = await db.prepare('SELECT * FROM games ORDER BY date DESC').all();
  return results;
}

export async function getUpcomingAndRecentGames(): Promise<{ upcoming: any | null; recent: any | null }> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const upcoming = await db.prepare(
    'SELECT * FROM games WHERE date >= ? ORDER BY date ASC LIMIT 1'
  ).bind(today).first();
  const recent = await db.prepare(
    'SELECT * FROM games WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(today).first();
  return { upcoming, recent };
}

export async function getGame(id: string) {
  const db = await getDB();
  return await db.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
}

export async function createGame(date: string, time: string, signup_deadline: string) {
  const db = await getDB();
  const id = `game-${Date.now()}`;
  const now = new Date().toISOString();
  const { results } = await db.prepare(
    'INSERT INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(id, date, time, signup_deadline, 'open', now, now).all();
  return results[0] ?? null;
}

export async function updateGame(id: string, updates: Record<string, any>) {
  const db = await getDB();
  const now = new Date().toISOString();
  const keys = Object.keys(updates);
  const fields = keys.map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);

  const { results } = await db.prepare(
    `UPDATE games SET ${fields}, updated_at = ? WHERE id = ? RETURNING *`
  ).bind(...values, now, id).all();
  return results[0] ?? null;
}

export async function deleteGame(id: string) {
  const db = await getDB();
  await db.prepare('DELETE FROM signups WHERE game_id = ?').bind(id).run();
  const { results } = await db.prepare('DELETE FROM games WHERE id = ? RETURNING id').bind(id).all();
  return results.length > 0;
}

// Resolve a player name through aliases and normalize case
export async function resolvePlayerName(inputName: string): Promise<string> {
  const db = await getDB();
  const { results } = await db.prepare('SELECT name, aliases FROM regulars').all();

  const trimmed = inputName.trim();
  for (const r of results as any[]) {
    // Check if input matches a regular's name (case-insensitive)
    if (r.name.toLowerCase() === trimmed.toLowerCase()) return r.name;
    // Check aliases
    const aliases: string[] = r.aliases ? JSON.parse(r.aliases) : [];
    if (aliases.some((a: string) => a.toLowerCase() === trimmed.toLowerCase())) return r.name;
  }

  // Not a known regular — title-case the input
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Signups
export async function getSignupsForGame(gameId: string) {
  const db = await getDB();
  const { results } = await db.prepare('SELECT * FROM signups WHERE game_id = ?').bind(gameId).all();

  return {
    in: results.filter((s: any) => s.status === 'in').map((s: any) => ({ name: s.player_name, late: !!s.late })),
    out: results.filter((s: any) => s.status === 'out').map((s: any) => ({ name: s.player_name, late: !!s.late })),
  };
}

export async function addSignup(gameId: string, playerName: string, status: 'in' | 'out') {
  const db = await getDB();
  const now = new Date().toISOString();
  const resolvedName = await resolvePlayerName(playerName);

  // Check if signup is past deadline
  const game: any = await db.prepare('SELECT signup_deadline FROM games WHERE id = ?').bind(gameId).first();
  const isLate = game?.signup_deadline ? new Date(now) > new Date(game.signup_deadline) : false;

  // Case-insensitive lookup for existing signup
  const existing = await db.prepare(
    'SELECT id FROM signups WHERE game_id = ? AND player_name = ?'
  ).bind(gameId, resolvedName).first();

  if (existing) {
    const { results } = await db.prepare(
      'UPDATE signups SET status = ?, late = ?, updated_at = ? WHERE game_id = ? AND player_name = ? RETURNING *'
    ).bind(status, isLate ? 1 : 0, now, gameId, resolvedName).all();
    return { success: true, results };
  } else {
    const id = `sig-${Date.now()}`;
    const { results } = await db.prepare(
      'INSERT INTO signups (id, game_id, player_name, status, late, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(id, gameId, resolvedName, status, isLate ? 1 : 0, now, now).all();
    return { success: true, results };
  }
}

// Regulars
export async function getRegulars(): Promise<any[]> {
  const db = await getDB();
  const { results } = await db.prepare('SELECT * FROM regulars ORDER BY name ASC').all();
  return results.map((r: any) => ({
    ...r,
    aliases: r.aliases ? JSON.parse(r.aliases) : [],
  }));
}

export async function getRegular(id: string) {
  const db = await getDB();
  const regular: any = await db.prepare('SELECT * FROM regulars WHERE id = ?').bind(id).first();
  if (!regular) return null;
  return { ...regular, aliases: regular.aliases ? JSON.parse(regular.aliases) : [] };
}

export async function createRegular(name: string, aliases: string[] = []) {
  const db = await getDB();
  const id = `reg-${Date.now()}`;
  const now = new Date().toISOString();
  const { results } = await db.prepare(
    'INSERT INTO regulars (id, name, aliases, created_at) VALUES (?, ?, ?, ?) RETURNING *'
  ).bind(id, name, JSON.stringify(aliases), now).all();
  const regular: any = results[0];
  if (!regular) return null;
  return { ...regular, aliases: JSON.parse(regular.aliases || '[]') };
}

export async function updateRegular(id: string, name?: string, aliases?: string[]) {
  const db = await getDB();
  const updates: Record<string, any> = {};
  if (name) updates.name = name;
  if (aliases) updates.aliases = JSON.stringify(aliases);
  if (Object.keys(updates).length === 0) return null;

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);

  const { results } = await db.prepare(
    `UPDATE regulars SET ${fields} WHERE id = ? RETURNING *`
  ).bind(...values, id).all();
  const regular: any = results[0];
  if (!regular) return null;
  return { ...regular, aliases: JSON.parse(regular.aliases || '[]') };
}

export async function deleteRegular(id: string) {
  const db = await getDB();
  const { results } = await db.prepare('DELETE FROM regulars WHERE id = ? RETURNING id').bind(id).all();
  return results.length > 0;
}
