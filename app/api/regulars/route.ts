import { NextResponse } from 'next/server';
import { getRegulars } from '@/lib/db';

export async function GET() {
  try {
    const regulars = await getRegulars();
    return NextResponse.json(regulars);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch regulars' },
      { status: 500 }
    );
  }
}
