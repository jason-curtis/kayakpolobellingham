import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin } from '@/lib/auth';

async function getDB() {
  const { env } = await getCloudflareContext();
  return (env as any).D1_DB;
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { records } = (await request.json()) as any;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    const db = await getDB();

    // Recreate table with correct schema
    await db.prepare('DROP TABLE IF EXISTS attendance_history').run();
    await db.prepare(`CREATE TABLE attendance_history (
      id TEXT PRIMARY KEY,
      game_date TEXT NOT NULL,
      player_name TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT DEFAULT 'email',
      created_at TEXT NOT NULL
    )`).run();

    await db.prepare('CREATE INDEX IF NOT EXISTS idx_ah_date ON attendance_history(game_date)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_ah_player ON attendance_history(player_name)').run();

    // Insert records in batches
    let inserted = 0;
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO attendance_history (id, game_date, player_name, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );

    // D1 supports batch operations
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const stmts = batch.map((r: any) =>
        stmt.bind(r.id, r.game_date, r.player_name, r.status, r.source || 'email', r.created_at)
      );
      await db.batch(stmts);
      inserted += batch.length;
    }

    return NextResponse.json({ inserted, total: records.length });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed', details: String(error) },
      { status: 500 }
    );
  }
}
