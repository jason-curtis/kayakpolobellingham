import { NextRequest, NextResponse } from 'next/server';
import { addSignup } from '@/lib/d1';

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

    const result = await addSignup(params.id, playerName, status);
    if (!result.success) {
      return NextResponse.json(
        { error: result.errors?.[0] || 'Signup failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result.results?.[0] });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 }
    );
  }
}
