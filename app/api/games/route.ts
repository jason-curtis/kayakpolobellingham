import { NextRequest, NextResponse } from 'next/server';
import { getGames, getUpcomingAndRecentGames, getSignupsForGame, getRegulars } from '@/lib/d1';

async function enrichGame(game: any, regularNames: string[]) {
  const signups = await getSignupsForGame(game.id);
  return {
    ...game,
    signupDeadline: game.signup_deadline,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
    signups,
    regulars: regularNames,
  };
}

export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view');
    const regulars = await getRegulars();
    const regularNames = regulars.map(r => r.name);

    if (view === 'home') {
      const { upcoming, recent } = await getUpcomingAndRecentGames();
      const games = [upcoming, recent].filter(Boolean);
      const enriched = await Promise.all(games.map(g => enrichGame(g, regularNames)));
      return NextResponse.json(enriched);
    }

    // Default: all games (for history page, admin, etc.)
    const games = await getGames();
    const enriched = await Promise.all(games.map(g => enrichGame(g, regularNames)));
    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Failed to fetch games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
