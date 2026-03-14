'use client'

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import GameCard, { Game } from '@/app/components/GameCard';

export default function GameDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('kayakpolo_player_name');
    if (stored) setPlayerName(stored);
    fetchGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchGame = async () => {
    try {
      const res = await fetch(`/api/games/${id}`);
      if (res.status === 404) {
        setError('Game not found');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch game');
      setGame(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading game');
    } finally {
      setLoading(false);
    }
  };

  const savePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('kayakpolo_player_name', name);
  };

  const handleSignup = async (gameId: string, name: string, status: 'in' | 'out' | 'maybe') => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/games/${gameId}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name.trim(), status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Signup failed');
      }
      savePlayerName(name);
      await fetchGame();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">
            Kayak Polo Bellingham
          </h1>
          <p className="text-sm text-blue-100">Game details</p>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded mb-6">{error}</div>
        )}

        {game && (
          <GameCard
            game={game}
          />
        )}

        <div className="text-center mt-8 space-x-4">
          <a href="/" className="text-white hover:text-blue-200 underline text-sm">
            Home
          </a>
          <a href="/history" className="text-white hover:text-blue-200 underline text-sm">
            Game History
          </a>
          <a href="/stats" className="text-white hover:text-blue-200 underline text-sm">
            Stats
          </a>
        </div>
      </div>
    </div>
  );
}
