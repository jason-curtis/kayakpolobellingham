import { NextResponse } from 'next/server';
import { getGames, getSignupsForGame, getRegulars } from '@/lib/db';

export async function GET() {
  try {
    const games = await getGames();
    const regulars = await getRegulars();
    const regularNames = regulars.map(r => r.name);

    // Enrich games with signup data
    const enrichedGames = await Promise.all(
      games.map(async (game) => {
        const signups = await getSignupsForGame(game.id);
        return {
          ...game,
          signups,
          regulars: regularNames,
        };
      })
    );

    return NextResponse.json(enrichedGames);
  } catch (error) {
    console.error('Failed to fetch games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
