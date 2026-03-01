import { NextRequest, NextResponse } from 'next/server';
import { createGame } from '@/lib/d1';

export async function POST(request: NextRequest) {
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
