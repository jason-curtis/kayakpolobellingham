// D1 Database Operations
// This file handles all interactions with the D1 database

export interface QueryResult {
  success: boolean;
  results?: any[];
  errors?: string[];
}

const ACCOUNT_ID = '7b24a491f5dc20008fd759bb3a5b0636';
const DATABASE_ID = 'b2a2e2bf-5b93-4c52-b2b3-94b15587addd';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function queryD1(sql: string, params?: any[]): Promise<QueryResult> {
  if (!API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN not set');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  const data = await response.json();

  if (!data.success) {
    return {
      success: false,
      errors: data.errors || ['Unknown error'],
    };
  }

  return {
    success: true,
    results: data.result,
  };
}

// Games
export async function getGames() {
  const result = await queryD1('SELECT * FROM games ORDER BY date ASC');
  return result.results || [];
}

export async function getGame(id: string) {
  const result = await queryD1('SELECT * FROM games WHERE id = ?', [id]);
  return result.results?.[0] || null;
}

export async function createGame(date: string, time: string, signup_deadline: string) {
  const id = `game-${Date.now()}`;
  const now = new Date().toISOString();
  const result = await queryD1(
    'INSERT INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [id, date, time, signup_deadline, 'open', now, now]
  );
  return result.results?.[0] || null;
}

export async function updateGame(id: string, updates: any) {
  const now = new Date().toISOString();
  const fields = Object.entries(updates)
    .map(([key], i) => `${key} = ?`)
    .join(', ');
  const values = Object.values(updates);

  const result = await queryD1(
    `UPDATE games SET ${fields}, updated_at = ? WHERE id = ? RETURNING *`,
    [...values, now, id]
  );
  return result.results?.[0] || null;
}

export async function deleteGame(id: string) {
  await queryD1('DELETE FROM signups WHERE game_id = ?', [id]);
  const result = await queryD1('DELETE FROM games WHERE id = ? RETURNING id', [id]);
  return !!result.results?.length;
}

// Signups
export async function getSignupsForGame(gameId: string) {
  const result = await queryD1('SELECT * FROM signups WHERE game_id = ?', [gameId]);
  const signups = result.results || [];

  return {
    in: signups.filter((s: any) => s.status === 'in').map((s: any) => s.player_name),
    out: signups.filter((s: any) => s.status === 'out').map((s: any) => s.player_name),
  };
}

export async function addSignup(gameId: string, playerName: string, status: 'in' | 'out') {
  const id = `sig-${Date.now()}`;
  const now = new Date().toISOString();

  // Try to update existing, or insert if not found
  const existing = await queryD1(
    'SELECT id FROM signups WHERE game_id = ? AND player_name = ?',
    [gameId, playerName]
  );

  if (existing.results?.length) {
    // Update
    return await queryD1(
      'UPDATE signups SET status = ?, updated_at = ? WHERE game_id = ? AND player_name = ? RETURNING *',
      [status, now, gameId, playerName]
    );
  } else {
    // Insert
    return await queryD1(
      'INSERT INTO signups (id, game_id, player_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      [id, gameId, playerName, status, now, now]
    );
  }
}

// Regulars
export async function getRegulars() {
  const result = await queryD1('SELECT * FROM regulars ORDER BY name ASC');
  return (result.results || []).map((r: any) => ({
    ...r,
    aliases: r.aliases ? JSON.parse(r.aliases) : [],
  }));
}

export async function getRegular(id: string) {
  const result = await queryD1('SELECT * FROM regulars WHERE id = ?', [id]);
  const regular = result.results?.[0];
  if (!regular) return null;
  return {
    ...regular,
    aliases: regular.aliases ? JSON.parse(regular.aliases) : [],
  };
}

export async function createRegular(name: string, aliases: string[] = []) {
  const id = `reg-${Date.now()}`;
  const now = new Date().toISOString();
  const result = await queryD1(
    'INSERT INTO regulars (id, name, aliases, created_at) VALUES (?, ?, ?, ?) RETURNING *',
    [id, name, JSON.stringify(aliases), now]
  );
  const regular = result.results?.[0];
  if (!regular) return null;
  return {
    ...regular,
    aliases: JSON.parse(regular.aliases || '[]'),
  };
}

export async function updateRegular(id: string, name?: string, aliases?: string[]) {
  const updates: any = {};
  if (name) updates.name = name;
  if (aliases) updates.aliases = JSON.stringify(aliases);

  if (Object.keys(updates).length === 0) return null;

  const fields = Object.entries(updates)
    .map(([key]) => `${key} = ?`)
    .join(', ');
  const values = Object.values(updates);

  const result = await queryD1(
    `UPDATE regulars SET ${fields} WHERE id = ? RETURNING *`,
    [...values, id]
  );
  const regular = result.results?.[0];
  if (!regular) return null;
  return {
    ...regular,
    aliases: JSON.parse(regular.aliases || '[]'),
  };
}

export async function deleteRegular(id: string) {
  const result = await queryD1('DELETE FROM regulars WHERE id = ? RETURNING id', [id]);
  return !!result.results?.length;
}
