import { NextRequest, NextResponse } from 'next/server';
import { createGame } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { date, time, signupDeadline } = await request.json();

    if (!date || !time || !signupDeadline) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const game = await createGame({
      date,
      time,
      signupDeadline,
      status: 'open',
    });

    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}
