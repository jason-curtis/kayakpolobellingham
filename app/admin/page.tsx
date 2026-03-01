'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Game {
  id: string;
  date: string;
  time: string;
  signupDeadline: string;
  status: 'open' | 'closed' | 'cancelled';
}

interface Regular {
  id: string;
  name: string;
  aliases: string[];
}

export default function AdminPortal() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'games' | 'regulars'>('games');
  const [games, setGames] = useState<Game[]>([]);
  const [regulars, setRegulars] = useState<Regular[]>([]);

  // Game form state
  const [newGame, setNewGame] = useState({
    date: '',
    time: '09:00',
    signupDeadline: '',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setIsLoggedIn(true);
        setPassword('');
        fetchData();
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Login failed');
    }
  };

  const fetchData = async () => {
    try {
      const gamesRes = await fetch('/api/games');
      if (gamesRes.ok) {
        setGames(await gamesRes.json());
      }
      const regularsRes = await fetch('/api/regulars');
      if (regularsRes.ok) {
        setRegulars(await regularsRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGame),
      });

      if (res.ok) {
        setNewGame({ date: '', time: '09:00', signupDeadline: '' });
        setError('');
        fetchData();
      } else {
        setError('Failed to create game');
      }
    } catch (err) {
      setError('Error creating game');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            🔐 Admin Portal
          </h1>
          <p className="text-gray-600 text-center mb-6">Kayak Polo Bellingham</p>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded mb-4 text-gray-900 placeholder-gray-400"
              autoFocus
            />
            <button
              type="submit"
              className="w-full p-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Login
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Demo: Use password "marine park tides swirl"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            🎮 Admin Portal
          </h1>
          <button
            onClick={() => {
              setIsLoggedIn(false);
              setPassword('');
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('games')}
            className={`px-4 py-2 rounded font-semibold transition ${
              tab === 'games'
                ? 'bg-white text-blue-600'
                : 'bg-white/30 text-white hover:bg-white/40'
            }`}
          >
            📅 Manage Games
          </button>
          <button
            onClick={() => setTab('regulars')}
            className={`px-4 py-2 rounded font-semibold transition ${
              tab === 'regulars'
                ? 'bg-white text-blue-600'
                : 'bg-white/30 text-white hover:bg-white/40'
            }`}
          >
            👥 Manage Regulars
          </button>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded mb-6">{error}</div>
        )}

        {/* Games Tab */}
        {tab === 'games' && (
          <div className="space-y-6">
            {/* Create Game Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                ➕ Create New Game
              </h2>
              <form onSubmit={handleCreateGame} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Game Date
                    </label>
                    <input
                      type="date"
                      value={newGame.date}
                      onChange={(e) => setNewGame({ ...newGame, date: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Game Time
                    </label>
                    <input
                      type="time"
                      value={newGame.time}
                      onChange={(e) => setNewGame({ ...newGame, time: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Signup Deadline
                    </label>
                    <input
                      type="datetime-local"
                      value={newGame.signupDeadline}
                      onChange={(e) => setNewGame({ ...newGame, signupDeadline: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full p-3 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
                >
                  Create Game
                </button>
              </form>
            </div>

            {/* Games List */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                📋 Scheduled Games
              </h2>
              {games.length === 0 ? (
                <p className="text-gray-600">No games scheduled yet.</p>
              ) : (
                <div className="space-y-3">
                  {games.map((game) => (
                    <div key={game.id} className="border rounded p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-gray-900">
                            {game.date} • {game.time}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Signups close: {new Date(game.signupDeadline).toLocaleString()}
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded text-sm font-semibold ${
                          game.status === 'open'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {game.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regulars Tab */}
        {tab === 'regulars' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              👥 Player Aliases
            </h2>
            {regulars.length === 0 ? (
              <p className="text-gray-600">No regulars configured yet.</p>
            ) : (
              <div className="space-y-3">
                {regulars.map((regular) => (
                  <div key={regular.id} className="border rounded p-4 bg-gray-50">
                    <div className="font-bold text-gray-900">{regular.name}</div>
                    {regular.aliases.length > 0 && (
                      <div className="text-sm text-gray-600 mt-1">
                        Aliases: {regular.aliases.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
