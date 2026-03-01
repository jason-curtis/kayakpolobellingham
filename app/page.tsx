'use client'

import { useEffect, useState } from 'react';

interface Game {
  id: string;
  date: string;
  time: string;
  signupDeadline: string;
  status: 'open' | 'closed' | 'cancelled';
  signups: {
    in: string[];
    out: string[];
  };
  regulars: string[];
}

const TIMEZONE = 'America/Los_Angeles';

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
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
      const res = await fetch('/api/games');
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

  const savePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('kayakpolo_player_name', name);
  };

  const submitSignup = async (status: 'in' | 'out') => {
    if (!playerName.trim() || !selectedGame) {
      setError('Please enter your name');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/games/${selectedGame.id}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim(), status }),
      });

      if (!res.ok) throw new Error('Signup failed');

      savePlayerName(playerName);
      await fetchGames();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatGameDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'numeric',
      day: 'numeric',
      timeZone: TIMEZONE,
    });
    return formatter.format(date);
  };

  const formatGameTime = (timeStr: string) => {
    if (!timeStr.includes(':')) return timeStr;
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}${parseInt(minutes) !== 0 ? ':' + minutes : ''}${ampm}`;
  };

  const formatDeadlineDate = (deadlineStr: string) => {
    const deadline = new Date(deadlineStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: TIMEZONE,
    });
    return formatter.format(deadline);
  };

  const isSignupOpen = (game: Game) => {
    const now = new Date();
    const deadline = new Date(game.signupDeadline);
    return now <= deadline;
  };

  const getGameStatus = (game: Game) => {
    const now = new Date();
    const gameStartTime = new Date(`${game.date}T${game.time}`);
    const deadline = new Date(game.signupDeadline);
    const signupCount = game.signups.in.length;

    // If before deadline, show signup status
    if (now <= deadline) {
      return signupCount >= 6 ? 'GAME ON ✅' : `${signupCount}/6`;
    }

    // After deadline but before game time, show final status
    if (now <= gameStartTime) {
      return signupCount >= 6 ? 'GAME ON ✅' : 'NO GAME ❌';
    }

    // Game is past
    return 'Game Complete';
  };

  const regularsRemaining = (game: Game) => {
    const signed = new Set([...game.signups.in, ...game.signups.out]);
    return game.regulars.filter(r => !signed.has(r)).length;
  };

  if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
            🚣 Kayak Polo Bellingham
          </h1>
          <p className="text-blue-100">Weekly pickup games</p>
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
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  className={`w-full p-4 rounded-lg text-left transition ${
                    selectedGame?.id === game.id
                      ? 'bg-white shadow-lg'
                      : 'bg-white/80 hover:bg-white'
                  }`}
                >
                  <div className="font-bold text-gray-900">{formatGameDate(game.date)}</div>
                  <div className="text-sm text-gray-600">{formatGameTime(game.time)}</div>
                  <div className={`text-sm font-semibold mt-1 ${
                    getGameStatus(game).includes('GAME ON')
                      ? 'text-green-600'
                      : getGameStatus(game).includes('NO GAME')
                      ? 'text-red-600'
                      : 'text-blue-600'
                  }`}>
                    {getGameStatus(game)}
                  </div>
                </button>
              ))}
            </div>

            {/* Game Details & Signup */}
            {selectedGame && (
              <div className="md:col-span-2 space-y-6">
                {/* Game Header */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">
                    {formatGameDate(selectedGame.date)} • {formatGameTime(selectedGame.time)}
                  </h2>

                  {/* Main Headline */}
                  <div className="text-lg font-semibold text-gray-800 mb-4">
                    {selectedGame.signups.in.length} in • {selectedGame.signups.out.length} out • {regularsRemaining(selectedGame)} regulars remaining
                  </div>

                  {/* Game Status */}
                  <div className={`text-2xl font-bold py-3 rounded mb-4 text-center ${
                    getGameStatus(selectedGame).includes('GAME ON')
                      ? 'bg-green-100 text-green-800'
                      : getGameStatus(selectedGame).includes('NO GAME')
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {getGameStatus(selectedGame)}
                  </div>

                  {/* Deadline Info */}
                  {isSignupOpen(selectedGame) ? (
                    <p className="text-sm text-gray-600">
                      ✅ <strong>Signups open</strong> until {formatDeadlineDate(selectedGame.signupDeadline)} 6PM
                    </p>
                  ) : (
                    <p className="text-sm text-red-600">
                      ❌ <strong>Signups closed</strong> (deadline was {formatDeadlineDate(selectedGame.signupDeadline)} 6PM)
                    </p>
                  )}

                  {!isSignupOpen(selectedGame) && selectedGame.signups.in.length < 6 && (
                    <p className="text-sm text-red-600 mt-2">
                      ⚠️ Game cancelled - fewer than 6 signed up
                    </p>
                  )}
                </div>

                {/* Regulars & Signup */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="font-bold text-gray-900 mb-4">👥 The Regulars</h3>
                  <div className="space-y-2 mb-6">
                    {selectedGame.regulars.map((regular) => {
                      const isIn = selectedGame.signups.in.includes(regular);
                      const isOut = selectedGame.signups.out.includes(regular);
                      return (
                        <div key={regular} className="flex items-center gap-3">
                          <span className={`inline-block w-3 h-3 rounded-full ${
                            isIn ? 'bg-green-500' : isOut ? 'bg-red-500' : 'bg-gray-300'
                          }`} />
                          <span className="text-gray-900 flex-1">{regular}</span>
                          {!isIn && !isOut && <span className="text-xs text-gray-500">(waiting)</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Your Signup */}
                  {isSignupOpen(selectedGame) && (
                    <div className="border-t pt-4">
                      <h3 className="font-bold text-gray-900 mb-3">🎯 Your Signup</h3>
                      <input
                        type="text"
                        placeholder="Your name"
                        value={playerName}
                        onChange={(e) => savePlayerName(e.target.value)}
                        className="w-full p-2 border rounded mb-4 text-gray-900 placeholder-gray-400"
                      />

                      <div className="flex gap-2">
                        <button
                          onClick={() => submitSignup('in')}
                          disabled={isSubmitting || !playerName.trim()}
                          className={`flex-1 p-3 rounded font-semibold transition ${
                            isSubmitting || !playerName.trim()
                              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                              : 'bg-green-500 text-white hover:bg-green-600'
                          }`}
                        >
                          ✅ I'm In
                        </button>
                        <button
                          onClick={() => submitSignup('out')}
                          disabled={isSubmitting || !playerName.trim()}
                          className={`flex-1 p-3 rounded font-semibold transition ${
                            isSubmitting || !playerName.trim()
                              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                              : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          ❌ I'm Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Link */}
        <div className="text-center mt-8">
          <a href="/admin" className="text-white hover:text-blue-200 underline text-sm">
            Admin Portal
          </a>
        </div>
      </div>
    </div>
  );
}
