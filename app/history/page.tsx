'use client'

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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
const PAGE_SIZE = 20;

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

function HistoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);

  const [games, setGames] = useState<Game[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games?page=${currentPage}&limit=${PAGE_SIZE}`)
      .then(res => res.json())
      .then(data => {
        setGames(data.games);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentPage]);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }
    const qs = params.toString();
    router.push(qs ? `/history?${qs}` : '/history');
  };

  if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Game History</h1>
          <p className="text-blue-100">{total} games</p>
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

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-4 py-2 bg-white rounded-lg shadow text-gray-900 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition"
            >
              Previous
            </button>
            <span className="text-white text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 bg-white rounded-lg shadow text-gray-900 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition"
            >
              Next
            </button>
          </div>
        )}

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

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-white">Loading...</div>}>
      <HistoryContent />
    </Suspense>
  );
}
