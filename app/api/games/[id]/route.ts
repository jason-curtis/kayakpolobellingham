import { NextRequest, NextResponse } from 'next/server';
import { getGame, getGameByDate, getSignupsForGame, getRegulars } from '@/lib/d1';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Support both date-based IDs (2026-03-08) and legacy IDs (game-123456)
    let game = await getGame(params.id) as any;
    if (!game && /^\d{4}-\d{2}-\d{2}$/.test(params.id)) {
      const byDate = await getGameByDate(null, params.id);
      if (byDate) game = await getGame(byDate.id) as any;
    }
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const [signups, regulars] = await Promise.all([
      getSignupsForGame(game.id),
      getRegulars(),
    ]);

    return NextResponse.json({
      ...game,
      signupDeadline: game.signup_deadline,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      signups,
      regulars: regulars.map(r => r.name),
    });
  } catch (error) {
    console.error('Failed to fetch game:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}
