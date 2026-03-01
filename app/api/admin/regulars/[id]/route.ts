import { NextRequest, NextResponse } from 'next/server';
import { getRegular, updateRegular, deleteRegular } from '@/lib/d1';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const regular = await getRegular(params.id);
    if (!regular) {
      return NextResponse.json({ error: 'Regular not found' }, { status: 404 });
    }
    return NextResponse.json(regular);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch regular' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { name, aliases } = await request.json() as any;
    const regular = await updateRegular(params.id, name, aliases);
    if (!regular) {
      return NextResponse.json({ error: 'Regular not found' }, { status: 404 });
    }
    return NextResponse.json(regular);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update regular' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = await deleteRegular(params.id);
    if (!success) {
      return NextResponse.json({ error: 'Regular not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete regular' },
      { status: 500 }
    );
  }
}
