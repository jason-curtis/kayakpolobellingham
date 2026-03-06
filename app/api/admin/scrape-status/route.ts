import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const authError = requireAdmin(request as any);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const db = (env as { D1_DB: any }).D1_DB;

    const latest = await db
      .prepare('SELECT id, completed_at, last_message_id, topics_scraped, games_inserted, signups_inserted FROM scrapes WHERE id != ? ORDER BY completed_at DESC LIMIT 1')
      .bind('cursor')
      .first();

    const cursor = await db
      .prepare('SELECT last_message_id FROM scrape_cursor WHERE id = ?')
      .bind('cursor')
      .first();

    return NextResponse.json({
      latest: latest
        ? {
            id: (latest as any).id,
            completed_at: (latest as any).completed_at,
            last_message_id: (latest as any).last_message_id,
            topics_scraped: (latest as any).topics_scraped,
            games_inserted: (latest as any).games_inserted,
            signups_inserted: (latest as any).signups_inserted,
          }
        : null,
      cursor: cursor ? { last_message_id: (cursor as any).last_message_id } : null,
    });
  } catch (error) {
    console.error('Scrape status error:', error);
    return NextResponse.json(
      { error: 'Failed to get scrape status', details: String(error) },
      { status: 500 }
    );
  }
}
