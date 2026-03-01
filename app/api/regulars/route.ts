import { NextResponse } from 'next/server';
import { getRegulars } from '@/lib/d1';

export async function GET() {
  try {
    const regulars = await getRegulars();
    return NextResponse.json(regulars);
  } catch (error) {
    console.error('Failed to fetch regulars:', error);
    return NextResponse.json(
      { error: 'Failed to fetch regulars' },
      { status: 500 }
    );
  }
}
