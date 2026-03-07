'use client'

import { useEffect, useState } from 'react';
import GameCard, { Game, formatGameDate, formatGameTime, getGameStatus, getGameState } from '@/app/components/GameCard';

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [moreGames, setMoreGames] = useState<Game[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load player name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('kayakpolo_player_name');
    if (stored) setPlayerName(stored);
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const res = await fetch('/api/games?view=home');
      if (!res.ok) throw new Error('Failed to fetch games');
      const data = await res.json();
      setGames(data);
      if (data.length > 0) setSelectedGame(data[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading games');
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreGames = async () => {
    setLoadingMore(true);
    try {
      const offset = moreGames.length;
      const res = await fetch(`/api/games?view=more&offset=${offset}&limit=8`);
      if (!res.ok) throw new Error('Failed to fetch more games');
      const data = await res.json();
      const homeIds = new Set(games.map((g) => g.id));
      const existingIds = new Set(moreGames.map((g) => g.id));
      const newGames = data.games.filter((g: Game) => !homeIds.has(g.id) && !existingIds.has(g.id));
      setMoreGames((prev) => [...prev, ...newGames]);
      setHasMore(data.hasMore);
      setShowMore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading games');
    } finally {
      setLoadingMore(false);
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
      await fetchGames();
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">
            Kayak Polo Bellingham
          </h1>
          <p className="text-sm text-blue-100">Weekly pickup games</p>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded mb-6">{error}</div>
        )}

        {games.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No games scheduled yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Game List */}
            <div className="md:col-span-1 space-y-2">
              {[...games, ...(showMore ? moreGames : [])].map((game) => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  className={`w-full p-4 rounded-lg text-left transition ${
                    selectedGame?.id === game.id
                      ? 'bg-white shadow-lg'
                      : 'bg-white/80 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">{formatGameDate(game.date)}</div>
                      <div className="text-sm text-gray-600">{formatGameTime(game.time)}</div>
                    </div>
                    <a
                      href={`/games/${game.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-500 hover:text-blue-700 text-xs"
                      title="Permalink"
                    >
                      🔗
                    </a>
                  </div>
                  <div className={`text-sm font-semibold mt-1 ${
                    getGameState(game) === 'game_on'
                      ? 'text-green-600'
                      : getGameState(game) === 'cancelled'
                      ? 'text-red-600'
                      : 'text-blue-600'
                  }`}>
                    {getGameStatus(game)}
                  </div>
                </button>
              ))}
              {!showMore ? (
                <button
                  onClick={fetchMoreGames}
                  disabled={loadingMore}
                  className="w-full p-3 rounded-lg text-center text-sm font-medium text-blue-100 bg-white/20 hover:bg-white/30 transition"
                >
                  {loadingMore ? 'Loading...' : 'More games...'}
                </button>
              ) : hasMore ? (
                <a
                  href="/history"
                  className="block w-full p-3 rounded-lg text-center text-sm font-medium text-blue-100 bg-white/20 hover:bg-white/30 transition"
                >
                  View all games
                </a>
              ) : null}
            </div>

            {/* Game Details & Signup */}
            {selectedGame && (
              <div className="md:col-span-2">
                <GameCard
                  game={selectedGame}
                  onSignup={handleSignup}
                  playerName={playerName}
                  onPlayerNameChange={savePlayerName}
                  isSubmitting={isSubmitting}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer Links */}
        <div className="text-center mt-8 space-x-4">
          <a href="/history" className="text-white hover:text-blue-200 underline text-sm">
            Game History
          </a>
          <a href="/stats" className="text-white hover:text-blue-200 underline text-sm">
            Stats
          </a>
          <a href="/admin" className="text-white hover:text-blue-200 underline text-sm">
            Admin Portal
          </a>
        </div>
      </div>
    </div>
  );
}
