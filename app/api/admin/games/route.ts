import { NextRequest, NextResponse } from 'next/server';
import { createGame, getGames, getGamesPaginated, getSignupsForGame } from '@/lib/d1';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const pageParam = request.nextUrl.searchParams.get('page');
    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20') || 20));
      const { games, total } = await getGamesPaginated(page, limit);
      const enriched = await Promise.all(games.map(async (game: any) => {
        const signups = await getSignupsForGame(game.id);
        return { ...game, signups };
      }));
      return NextResponse.json({ games: enriched, page, totalPages: Math.ceil(total / limit), total });
    }
    const games = await getGames();
    const enriched = await Promise.all(games.map(async (game: any) => {
      const signups = await getSignupsForGame(game.id);
      return { ...game, signups };
    }));
    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Failed to fetch games:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { date, time, signupDeadline } = await request.json() as any;

    if (!date || !time || !signupDeadline) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const game = await createGame(date, time, signupDeadline);

    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    console.error('Game creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}
