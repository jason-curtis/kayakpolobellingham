'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Game {
  id: string;
  date: string;
  time: string;
  signup_deadline: string;
  status: string;
}

interface Regular {
  id: string;
  name: string;
  aliases: string[];
}

type Tab = 'games' | 'regulars' | 'scrape';
type Action = 'list' | 'create' | 'edit';

function Shimmer({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border rounded p-4 bg-gray-50">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

interface ScrapeLatest {
  id: string;
  completed_at: string;
  last_message_id: number;
  topics_scraped: number;
  games_inserted: number;
  signups_inserted: number;
}

export default function AdminPortal() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('games');
  const [action, setAction] = useState<Action>('list');

  // Games state
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesPage, setGamesPage] = useState(1);
  const [gamesTotalPages, setGamesTotalPages] = useState(1);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [newGame, setNewGame] = useState({
    date: '',
    time: '09:00',
    signupDeadline: '',
  });

  // Regulars state
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [regularsLoading, setRegularsLoading] = useState(false);
  const [editingRegular, setEditingRegular] = useState<Regular | null>(null);
  const [newRegular, setNewRegular] = useState({
    name: '',
    aliases: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/regulars');
        if (res.ok) {
          setIsLoggedIn(true);
          setRegulars(await res.json());
          fetchGames();
        }
      } catch {}
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  // Scrape state
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState('');
  const [scrapeLatest, setScrapeLatest] = useState<ScrapeLatest | null>(null);

  // Backfill state
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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

  const fetchGames = async (page = 1) => {
    setGamesLoading(true);
    try {
      const res = await fetch(`/api/admin/games?page=${page}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setGames(data.games);
        setGamesPage(data.page);
        setGamesTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch games:', err);
    } finally {
      setGamesLoading(false);
    }
  };

  const fetchRegulars = async () => {
    setRegularsLoading(true);
    try {
      const res = await fetch('/api/admin/regulars');
      if (res.ok) setRegulars(await res.json());
    } catch (err) {
      console.error('Failed to fetch regulars:', err);
    } finally {
      setRegularsLoading(false);
    }
  };

  const fetchData = async () => {
    await Promise.all([fetchGames(), fetchRegulars()]);
  };

  const fetchScrapeStatus = async () => {
    try {
      const res = await fetch('/api/admin/scrape-status');
      if (res.ok) {
        const data = await res.json();
        setScrapeLatest(data.latest ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch scrape status:', err);
    }
  };

  const handleScrapeFromGroups = async () => {
    setScrapeLoading(true);
    setScrapeMessage('');
    setError('');
    try {
      let nextStartId: number | undefined;
      for (;;) {
        const body = nextStartId != null ? { startId: nextStartId } : {};
        const res = await fetch('/api/admin/scrape-from-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? 'Scrape failed');
          break;
        }
        const data = await res.json();
        if (data.done) {
          setScrapeMessage(`Done! ${data.gamesInserted ?? 0} games, ${data.signupsInserted ?? 0} signups.`);
          await fetchScrapeStatus();
          fetchData();
          break;
        }
        nextStartId = data.nextStartId;
        setScrapeMessage(`Scraped to message ${data.lastMessageId}… continuing.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScrapeLoading(false);
    }
  };

  // Games CRUD
  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGame),
      });

      if (res.ok) {
        setNewGame({ date: '', time: '09:00', signupDeadline: '' });
        setError('');
        setAction('list');
        fetchData();
      } else {
        setError('Failed to create game');
      }
    } catch (err) {
      setError('Error creating game');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateGame = async (e: React.FormEvent) => {
    if (!editingGame) return;
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/games/${editingGame.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingGame),
      });

      if (res.ok) {
        setEditingGame(null);
        setError('');
        setAction('list');
        fetchData();
      } else {
        setError('Failed to update game');
      }
    } catch (err) {
      setError('Error updating game');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGame = async (id: string) => {
    if (!confirm('Delete this game?')) return;
    try {
      const res = await fetch(`/api/admin/games/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        setError('Failed to delete game');
      }
    } catch (err) {
      setError('Error deleting game');
    }
  };

  // Regulars CRUD
  const handleCreateRegular = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const aliases = newRegular.aliases
        .split(',')
        .map(a => a.trim())
        .filter(a => a);

      const res = await fetch('/api/admin/regulars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRegular.name, aliases }),
      });

      if (res.ok) {
        setNewRegular({ name: '', aliases: '' });
        setError('');
        setAction('list');
        fetchData();
      } else {
        setError('Failed to create regular');
      }
    } catch (err) {
      setError('Error creating regular');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRegular = async (e: React.FormEvent) => {
    if (!editingRegular) return;
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/regulars/${editingRegular.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingRegular.name,
          aliases: editingRegular.aliases,
        }),
      });

      if (res.ok) {
        setEditingRegular(null);
        setError('');
        setAction('list');
        fetchData();
      } else {
        setError('Failed to update regular');
      }
    } catch (err) {
      setError('Error updating regular');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRegular = async (id: string) => {
    if (!confirm('Delete this regular?')) return;
    try {
      const res = await fetch(`/api/admin/regulars/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        setError('Failed to delete regular');
      }
    } catch (err) {
      setError('Error deleting regular');
    }
  };

  const handleBackfillSources = async () => {
    setBackfillLoading(true);
    setBackfillMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/backfill-sources', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Backfill failed');
        return;
      }
      const data = await res.json();
      setBackfillMessage(`Done! ${data.messagesProcessed} messages processed, ${data.signupsUpdated} signups updated, ${data.skipped} skipped.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setBackfillLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

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
              setError('');
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setTab('games');
              setAction('list');
            }}
            className={`px-4 py-2 rounded font-semibold transition ${
              tab === 'games'
                ? 'bg-white text-blue-600'
                : 'bg-white/30 text-white hover:bg-white/40'
            }`}
          >
            📅 Games
          </button>
          <button
            onClick={() => {
              setTab('regulars');
              setAction('list');
            }}
            className={`px-4 py-2 rounded font-semibold transition ${
              tab === 'regulars'
                ? 'bg-white text-blue-600'
                : 'bg-white/30 text-white hover:bg-white/40'
            }`}
          >
            👥 Regulars
          </button>
          <button
            onClick={() => {
              setTab('scrape');
              fetchScrapeStatus();
            }}
            className={`px-4 py-2 rounded font-semibold transition ${
              tab === 'scrape'
                ? 'bg-white text-blue-600'
                : 'bg-white/30 text-white hover:bg-white/40'
            }`}
          >
            📥 Scrape
          </button>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded mb-6">{error}</div>
        )}

        {/* Games Tab */}
        {tab === 'games' && (
          <div>
            {action === 'list' && (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => {
                      setAction('create');
                      setNewGame({ date: '', time: '09:00', signupDeadline: '' });
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    ➕ New Game
                  </button>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    📋 Games
                  </h2>
                  {gamesLoading ? (
                    <Shimmer rows={5} />
                  ) : games.length === 0 ? (
                    <p className="text-gray-600">No games yet.</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {games.map((game) => (
                          <div key={game.id} className="border rounded p-4 bg-gray-50 flex justify-between items-start">
                            <div>
                              <div className="font-bold text-gray-900">
                                {game.date} • {game.time}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Deadline: {new Date(game.signup_deadline).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditingGame(game);
                                  setAction('edit');
                                }}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteGame(game.id)}
                                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {gamesTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <button
                            onClick={() => fetchGames(gamesPage - 1)}
                            disabled={gamesPage <= 1}
                            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-40"
                          >
                            Prev
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {gamesPage} of {gamesTotalPages}
                          </span>
                          <button
                            onClick={() => fetchGames(gamesPage + 1)}
                            disabled={gamesPage >= gamesTotalPages}
                            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {action === 'create' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">➕ Create Game</h2>
                <form onSubmit={handleCreateGame} className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Date
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
                        Time
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
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 p-3 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {isSubmitting ? 'Creating...' : 'Create Game'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('list')}
                      className="flex-1 p-3 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {action === 'edit' && editingGame && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Game</h2>
                <form onSubmit={handleUpdateGame} className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Date
                      </label>
                      <input
                        type="date"
                        value={editingGame.date}
                        onChange={(e) => setEditingGame({ ...editingGame, date: e.target.value })}
                        className="w-full p-2 border rounded text-gray-900"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Time
                      </label>
                      <input
                        type="time"
                        value={editingGame.time}
                        onChange={(e) => setEditingGame({ ...editingGame, time: e.target.value })}
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
                        value={editingGame.signup_deadline}
                        onChange={(e) => setEditingGame({ ...editingGame, signup_deadline: e.target.value })}
                        className="w-full p-2 border rounded text-gray-900"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 p-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Game'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGame(null);
                        setAction('list');
                      }}
                      className="flex-1 p-3 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Regulars Tab */}
        {tab === 'regulars' && (
          <div>
            {action === 'list' && (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => {
                      setAction('create');
                      setNewRegular({ name: '', aliases: '' });
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    ➕ New Regular
                  </button>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    👥 Regulars
                  </h2>
                  {regularsLoading ? (
                    <Shimmer rows={4} />
                  ) : regulars.length === 0 ? (
                    <p className="text-gray-600">No regulars yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {regulars.map((regular) => (
                        <div key={regular.id} className="border rounded p-4 bg-gray-50 flex justify-between items-start">
                          <div>
                            <div className="font-bold text-gray-900">
                              {regular.name}
                            </div>
                            {regular.aliases.length > 0 && (
                              <div className="text-sm text-gray-600 mt-1">
                                Aliases: {regular.aliases.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingRegular(regular);
                                setAction('edit');
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRegular(regular.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {action === 'create' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">➕ Create Regular</h2>
                <form onSubmit={handleCreateRegular} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newRegular.name}
                      onChange={(e) => setNewRegular({ ...newRegular, name: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Aliases (comma-separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., g, gazza"
                      value={newRegular.aliases}
                      onChange={(e) => setNewRegular({ ...newRegular, aliases: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 p-3 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {isSubmitting ? 'Creating...' : 'Create Regular'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('list')}
                      className="flex-1 p-3 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {action === 'edit' && editingRegular && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Regular</h2>
                <form onSubmit={handleUpdateRegular} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editingRegular.name}
                      onChange={(e) => setEditingRegular({ ...editingRegular, name: e.target.value })}
                      className="w-full p-2 border rounded text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Aliases (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={editingRegular.aliases.join(', ')}
                      onChange={(e) =>
                        setEditingRegular({
                          ...editingRegular,
                          aliases: e.target.value
                            .split(',')
                            .map(a => a.trim())
                            .filter(a => a),
                        })
                      }
                      className="w-full p-2 border rounded text-gray-900"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 p-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Regular'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRegular(null);
                        setAction('list');
                      }}
                      className="flex-1 p-3 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Scrape Tab */}
        {tab === 'scrape' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              📥 Scrape from Groups.io
            </h2>
            <p className="text-gray-600 mb-4">
              Fetch game topics and signups from the group. Progress is saved between chunks; re-run to resume.
            </p>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleScrapeFromGroups}
                disabled={scrapeLoading}
                className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400 w-fit"
              >
                {scrapeLoading ? 'Scraping…' : 'Scrape from Groups.io'}
              </button>
              {scrapeMessage && (
                <p className="text-gray-700">{scrapeMessage}</p>
              )}
              {scrapeLatest && (
                <div className="border rounded p-4 bg-gray-50 text-gray-800">
                  <div className="font-semibold mb-2">Last successful scrape</div>
                  <div className="text-sm">
                    {new Date(scrapeLatest.completed_at).toLocaleString()} — last message ID {scrapeLatest.last_message_id}, {scrapeLatest.topics_scraped} topics, {scrapeLatest.games_inserted} games, {scrapeLatest.signups_inserted} signups
                  </div>
                </div>
              )}
            </div>

            <hr className="my-6" />

            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Backfill Source Links
            </h2>
            <p className="text-gray-600 mb-4">
              Walk all groups.io messages via API and fill in note + source_url for existing signups that are missing them.
            </p>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleBackfillSources}
                disabled={backfillLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 w-fit"
              >
                {backfillLoading ? 'Backfilling…' : 'Backfill Sources'}
              </button>
              {backfillMessage && (
                <p className="text-gray-700">{backfillMessage}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
