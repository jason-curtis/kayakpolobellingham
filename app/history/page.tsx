'use client'

import { useEffect, useState } from 'react';

interface SignupEntry {
  name: string;
  late: boolean;
}

interface Game {
  id: string;
  date: string;
  time: string;
  status: string;
  signups: {
    in: SignupEntry[];
    out: SignupEntry[];
  };
}

const TIMEZONE = 'America/Los_Angeles';

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

function formatTime(timeStr: string) {
  if (!timeStr.includes(':')) return timeStr;
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${parseInt(minutes) !== 0 ? ':' + minutes : ''}${ampm}`;
}

export default function HistoryPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/games')
      .then(res => res.json())
      .then(data => setGames(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Game History</h1>
          <p className="text-blue-100">{games.length} games</p>
        </div>

        <div className="space-y-3">
          {games.map((game) => {
            const inCount = game.signups.in.length;
            const outCount = game.signups.out.length;
            const gameOn = inCount >= 6;
            return (
              <a key={game.id} href={`/games/${game.id}`} className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">{formatDate(game.date)}</div>
                    <div className="text-sm text-gray-500">{formatTime(game.time)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${gameOn ? 'text-green-600' : 'text-gray-400'}`}>
                      {inCount} in{outCount > 0 ? ` / ${outCount} out` : ''}
                    </div>
                    {inCount > 0 && (
                      <div className="text-xs text-gray-500 mt-1 max-w-[200px] md:max-w-[400px] truncate">
                        {game.signups.in.map(s => s.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        <div className="text-center mt-8 space-x-4">
          <a href="/" className="text-white hover:text-blue-200 underline text-sm">
            Back to Home
          </a>
          <a href="/stats" className="text-white hover:text-blue-200 underline text-sm">
            Stats
          </a>
        </div>
      </div>
    </div>
  );
}
