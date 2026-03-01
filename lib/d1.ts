// D1 Database Operations via native Cloudflare binding
import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getDB() {
  const { env } = await getCloudflareContext();
  return (env as any).D1_DB;
}

// Games
export async function getGames(): Promise<any[]> {
  const db = await getDB();
  const { results } = await db.prepare('SELECT * FROM games ORDER BY date ASC').all();
  return results;
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

// Signups
export async function getSignupsForGame(gameId: string) {
  const db = await getDB();
  const { results } = await db.prepare('SELECT * FROM signups WHERE game_id = ?').bind(gameId).all();

  return {
    in: results.filter((s: any) => s.status === 'in').map((s: any) => s.player_name),
    out: results.filter((s: any) => s.status === 'out').map((s: any) => s.player_name),
  };
}

export async function addSignup(gameId: string, playerName: string, status: 'in' | 'out') {
  const db = await getDB();
  const now = new Date().toISOString();

  const existing = await db.prepare(
    'SELECT id FROM signups WHERE game_id = ? AND player_name = ?'
  ).bind(gameId, playerName).first();

  if (existing) {
    const { results } = await db.prepare(
      'UPDATE signups SET status = ?, updated_at = ? WHERE game_id = ? AND player_name = ? RETURNING *'
    ).bind(status, now, gameId, playerName).all();
    return { success: true, results };
  } else {
    const id = `sig-${Date.now()}`;
    const { results } = await db.prepare(
      'INSERT INTO signups (id, game_id, player_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(id, gameId, playerName, status, now, now).all();
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
