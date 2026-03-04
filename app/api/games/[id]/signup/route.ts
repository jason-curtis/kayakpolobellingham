import { NextRequest, NextResponse } from 'next/server';
import { addSignup } from '@/lib/d1';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { playerName, status } = await request.json() as any;

    if (!playerName || !['in', 'out'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const result = await addSignup(params.id, playerName, status);
    return NextResponse.json({ success: true, data: result.results?.[0] });
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error?.message?.includes('already started')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 }
    );
  }
}
