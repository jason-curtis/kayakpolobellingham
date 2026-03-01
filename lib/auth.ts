import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'marine park tides swirl';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

export function verifyPassword(password: string): boolean {
  return hashPassword(password) === ADMIN_PASSWORD_HASH;
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  const session = request.cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
