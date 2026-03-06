import { NextRequest, NextResponse } from 'next/server';
import { getGames, getGamesPaginated, getUpcomingAndRecentGames, getSignupsForGame, getRegulars } from '@/lib/d1';

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

    // Paginated: history page
    const pageParam = request.nextUrl.searchParams.get('page');
    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20') || 20));
      const { games, total } = await getGamesPaginated(page, limit);
      const enriched = await Promise.all(games.map(g => enrichGame(g, regularNames)));
      return NextResponse.json({
        games: enriched,
        page,
        totalPages: Math.ceil(total / limit),
        total,
      });
    }

    // Default: all games (for admin, etc.)
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
