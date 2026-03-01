import { NextRequest, NextResponse } from 'next/server';
import { createGame, getGames, getSignupsForGame } from '@/lib/d1';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
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
