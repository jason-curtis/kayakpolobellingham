import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin } from '@/lib/auth';
import {
  scrapeChunk,
  gamesMapToParsedGames,
  serializeGamesMap,
  deserializeGamesMap,
  type GamesMap,
} from '@/lib/groups-io-scrape';

const CURSOR_ID = 'cursor';
const CHUNK_SIZE = 25;
const CHUNKS_PER_REQUEST = 2;

async function getDB() {
  const { env } = await getCloudflareContext();
  return (env as { D1_DB: any }).D1_DB;
}

/** Write parsed games/signups to D1 (hist-*), return counts */
async function writeGamesAndSignups(db: any, games: ReturnType<typeof gamesMapToParsedGames>): Promise<{ gamesInserted: number; signupsInserted: number }> {
  await db.prepare("DELETE FROM signups WHERE game_id LIKE 'hist-%'").run();
  await db.prepare("DELETE FROM games WHERE id LIKE 'hist-%'").run();

  const now = new Date().toISOString();
  let gamesInserted = 0;
  let signupsInserted = 0;

  for (const game of games) {
    const gameId = `hist-${game.date}-${game.time}`;
    const deadline = `${game.date}T${game.time}:00`;
    await db
      .prepare(
        'INSERT OR IGNORE INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(gameId, game.date, game.time, deadline, 'completed', now, now)
      .run();
    gamesInserted++;

    for (const player of game.players) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          'INSERT OR IGNORE INTO signups (id, game_id, player_name, status, late, note, source_url, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(id, gameId, player.name, player.status, 0, null, null, 'email', now, now)
        .run();
      signupsInserted++;
    }
  }

  return { gamesInserted, signupsInserted };
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const db = await getDB();
    const body = (await request.json().catch(() => ({}))) as { startId?: number };

    let startId: number;
    let map: GamesMap;

    const cursorRow = await db.prepare('SELECT last_message_id, games_json FROM scrape_cursor WHERE id = ?').bind(CURSOR_ID).first() as { last_message_id: number; games_json: string } | null;

    if (body.startId != null) {
      startId = body.startId;
      map = new Map();
    } else if (cursorRow) {
      startId = cursorRow.last_message_id + 1;
      map = deserializeGamesMap(cursorRow.games_json);
    } else {
      const lastScrape = await db.prepare('SELECT last_message_id FROM scrapes ORDER BY completed_at DESC LIMIT 1').first() as { last_message_id: number } | null;
      startId = lastScrape ? lastScrape.last_message_id + 1 : 1;
      map = new Map();
    }

    let totalTopicsScraped = 0;
    let lastMessageId = startId - 1;
    let done = false;

    for (let c = 0; c < CHUNKS_PER_REQUEST; c++) {
      const result = await scrapeChunk(startId, CHUNK_SIZE, map);
      totalTopicsScraped += result.topicsScraped;
      lastMessageId = result.lastMessageId;
      done = result.done;
      startId = result.lastMessageId + 1;
      if (done) break;
    }

    if (done) {
      const games = gamesMapToParsedGames(map);
      const { gamesInserted, signupsInserted } = await writeGamesAndSignups(db, games);
      const completedAt = new Date().toISOString();
      const scrapeId = `scrape-${Date.now()}`;
      await db
        .prepare(
          'INSERT INTO scrapes (id, completed_at, last_message_id, topics_scraped, games_inserted, signups_inserted) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(scrapeId, completedAt, lastMessageId, totalTopicsScraped, gamesInserted, signupsInserted)
        .run();
      await db.prepare('DELETE FROM scrape_cursor WHERE id = ?').bind(CURSOR_ID).run();

      return NextResponse.json({
        done: true,
        message: 'Scrape completed',
        completedAt,
        lastMessageId,
        topicsScraped: totalTopicsScraped,
        gamesInserted,
        signupsInserted,
      });
    }

    await db
      .prepare('INSERT OR REPLACE INTO scrape_cursor (id, last_message_id, games_json) VALUES (?, ?, ?)')
      .bind(CURSOR_ID, lastMessageId, serializeGamesMap(map))
      .run();

    return NextResponse.json({
      done: false,
      message: 'Chunk completed; call again to continue',
      lastMessageId,
      nextStartId: lastMessageId + 1,
      topicsScraped: totalTopicsScraped,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: 'Scrape failed', details: String(error) },
      { status: 500 }
    );
  }
}
