import { NextRequest, NextResponse } from 'next/server';

// TODO: Replace with proper password hashing
const ADMIN_PASSWORD = 'changeme';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (password === ADMIN_PASSWORD) {
      // Set a session cookie or token
      const response = NextResponse.json({ success: true });
      response.cookies.set({
        name: 'admin_session',
        value: 'authenticated',
        httpOnly: true,
        maxAge: 24 * 60 * 60,
      });
      return response;
    }

    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
