import { NextRequest, NextResponse } from 'next/server';
import { getRegulars, createRegular } from '@/lib/d1';

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

export async function POST(request: NextRequest) {
  try {
    const { name, aliases } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const regular = await createRegular(name, aliases || []);
    return NextResponse.json(regular, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create regular' },
      { status: 500 }
    );
  }
}
