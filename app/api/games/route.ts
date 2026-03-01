import { NextResponse } from 'next/server';

// In-memory storage for MVP (will be replaced with D1)
const games = [
  {
    id: 'game-001',
    date: '2026-03-02',
    time: '9:00 AM',
    signupDeadline: '2026-03-01T18:00:00Z',
    status: 'open',
    signups: {
      in: ['Cameron', 'Gib'],
      out: [],
    },
    regulars: ['Cameron', 'Gib', 'Gary', 'Dorothy', 'Jason', 'Mike'],
  },
  {
    id: 'game-002',
    date: '2026-03-09',
    time: '9:00 AM',
    signupDeadline: '2026-03-08T18:00:00Z',
    status: 'open',
    signups: {
      in: ['Cameron', 'Gary', 'Dorothy'],
      out: ['Gib'],
    },
    regulars: ['Cameron', 'Gib', 'Gary', 'Dorothy', 'Jason', 'Mike'],
  },
];

export async function GET() {
  return NextResponse.json(games);
}
