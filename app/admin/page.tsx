'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPortal() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Login failed');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Admin Portal
          </h1>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded mb-4 text-gray-900"
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
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          Admin Portal - Game Management
        </h1>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Create New Game
          </h2>
          <p className="text-gray-600 text-center py-8">
            Game creation interface coming soon...
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Manage Regulars
          </h2>
          <p className="text-gray-600 text-center py-8">
            Player management coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}
