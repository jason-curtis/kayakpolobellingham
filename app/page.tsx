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

interface Signup {
  playerName: string;
  status: 'in' | 'out';
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [signupStatus, setSignupStatus] = useState<'in' | 'out' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load player name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('kayakpolo_player_name');
    if (stored) setPlayerName(stored);

    // Fetch games
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

  const submitSignup = async () => {
    if (!playerName.trim() || !signupStatus || !selectedGame) {
      setError('Please enter your name and select in/out');
      return;
    }

    try {
      const res = await fetch(`/api/games/${selectedGame.id}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim(), status: signupStatus }),
      });

      if (!res.ok) throw new Error('Signup failed');

      savePlayerName(playerName);
      setSignupStatus(null);
      fetchGames(); // Refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    }
  };

  if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

  const getGameStatus = (game: Game) => {
    const now = new Date();
    const deadline = new Date(game.signupDeadline);
    if (now > deadline) return 'Signups closed';
    const signupCount = game.signups.in.length;
    if (signupCount >= 6) return `${signupCount}/6+ signed up`;
    return `${signupCount}/6 needed`;
  };

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
                  <div className="font-bold text-gray-900">{game.date}</div>
                  <div className="text-sm text-gray-600">{game.time}</div>
                  <div className="text-xs text-blue-600 mt-1">{getGameStatus(game)}</div>
                </button>
              ))}
            </div>

            {/* Game Details & Signup */}
            {selectedGame && (
              <div className="md:col-span-2 space-y-6">
                {/* Game Info */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {selectedGame.date} • {selectedGame.time}
                  </h2>

                  {new Date() > new Date(selectedGame.signupDeadline) ? (
                    <p className="text-red-600 font-semibold mb-4">
                      ❌ Signups closed (deadline: {selectedGame.signupDeadline})
                    </p>
                  ) : (
                    <p className="text-green-600 font-semibold mb-4">
                      ✅ Signups open until {selectedGame.signupDeadline}
                    </p>
                  )}

                  <p className="text-gray-600 mb-2">
                    <strong>{selectedGame.signups.in.length}</strong> in •
                    <strong> {selectedGame.signups.out.length}</strong> out
                  </p>

                  {selectedGame.signups.in.length < 6 && (
                    <p className="text-orange-600 text-sm">
                      ⚠️ {6 - selectedGame.signups.in.length} more needed for game
                    </p>
                  )}
                </div>

                {/* Regulars & Signups */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="font-bold text-gray-900 mb-3">The Regulars</h3>
                  <div className="space-y-2 mb-6">
                    {selectedGame.regulars.map((regular) => {
                      const isIn = selectedGame.signups.in.includes(regular);
                      const isOut = selectedGame.signups.out.includes(regular);
                      return (
                        <div key={regular} className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded-full ${
                            isIn ? 'bg-green-500' : isOut ? 'bg-red-500' : 'bg-gray-300'
                          }`} />
                          <span className="text-gray-900">{regular}</span>
                          {!isIn && !isOut && <span className="text-xs text-gray-500">(not yet)</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Signup Form */}
                  <div className="border-t pt-4">
                    <h3 className="font-bold text-gray-900 mb-3">Your Signup</h3>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={playerName}
                      onChange={(e) => savePlayerName(e.target.value)}
                      className="w-full p-2 border rounded mb-3 text-gray-900"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSignupStatus('in')}
                        className={`flex-1 p-3 rounded font-semibold transition ${
                          signupStatus === 'in'
                            ? 'bg-green-500 text-white'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        ✅ I'm In
                      </button>
                      <button
                        onClick={() => setSignupStatus('out')}
                        className={`flex-1 p-3 rounded font-semibold transition ${
                          signupStatus === 'out'
                            ? 'bg-red-500 text-white'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        ❌ I'm Out
                      </button>
                    </div>

                    <button
                      onClick={submitSignup}
                      className="w-full mt-3 p-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
                    >
                      Submit Signup
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Link */}
        <div className="text-center mt-8">
          <a href="/admin" className="text-white hover:text-blue-100 underline text-sm">
            Admin Portal
          </a>
        </div>
      </div>
    </div>
  );
}
