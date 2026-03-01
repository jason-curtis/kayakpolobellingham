import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { playerName, status } = body;

    if (!playerName || !['in', 'out'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // TODO: Save to D1 database
    console.log(`Signup: ${playerName} is ${status} for game ${params.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 }
    );
  }
}
