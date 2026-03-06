'use client'

import { useEffect, useState } from 'react';
import { getTimeRemaining, formatCountdown, formatCountdownLong } from '@/lib/countdown';

export interface SignupEntry {
  name: string;
  late: boolean;
  note?: string | null;
  source_url?: string | null;
  source_type?: string | null;
}

export interface Game {
  id: string;
  date: string;
  time: string;
  signupDeadline: string;
  status: 'open' | 'closed' | 'cancelled';
  signups: {
    in: SignupEntry[];
    out: SignupEntry[];
  };
  regulars: string[];
}

const TIMEZONE = 'America/Los_Angeles';

export function formatGameDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'numeric',
    day: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

export function formatGameTime(timeStr: string) {
  if (!timeStr.includes(':')) return timeStr;
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${parseInt(minutes) !== 0 ? ':' + minutes : ''}${ampm}`;
}

function formatDeadlineDate(deadlineStr: string) {
  const deadline = new Date(deadlineStr);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: TIMEZONE,
  }).format(deadline);
}

function isSignupOpen(game: Game) {
  const now = new Date();
  const deadline = new Date(game.signupDeadline);
  return now <= deadline;
}

function hasGameStarted(game: Game) {
  const now = new Date();
  const gameStart = new Date(`${game.date}T${game.time}`);
  return now >= gameStart;
}

export function getGameStatus(game: Game) {
  const now = new Date();
  const gameStartTime = new Date(`${game.date}T${game.time}`);
  const deadline = new Date(game.signupDeadline);
  const signupCount = game.signups.in.length;

  if (now <= deadline) {
    return signupCount >= 6 ? 'GAME ON ✅' : `${signupCount}/6`;
  }

  return signupCount >= 6 ? 'GAME ON ✅' : 'NO GAME ❌';
}

function signedNames(game: Game) {
  return new Set([...game.signups.in.map(s => s.name), ...game.signups.out.map(s => s.name)]);
}

function regularsRemaining(game: Game) {
  const signed = signedNames(game);
  return game.regulars.filter(r => !signed.has(r)).length;
}

interface GameCardProps {
  game: Game;
  onSignup?: (gameId: string, playerName: string, status: 'in' | 'out') => Promise<void>;
  playerName?: string;
  onPlayerNameChange?: (name: string) => void;
  isSubmitting?: boolean;
}

export default function GameCard({ game, onSignup, playerName = '', onPlayerNameChange, isSubmitting = false }: GameCardProps) {
  const [countdowns, setCountdowns] = useState({ gameStart: '', signupDeadline: '' });

  useEffect(() => {
    const update = () => {
      const gameStartTime = new Date(`${game.date}T${game.time}`);
      const gameStartRemaining = getTimeRemaining(gameStartTime);
      const deadlineRemaining = getTimeRemaining(game.signupDeadline);
      setCountdowns({
        gameStart: formatCountdown(gameStartRemaining),
        signupDeadline: formatCountdownLong(deadlineRemaining),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game.date, game.time, game.signupDeadline]);

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {formatGameDate(game.date)} • {formatGameTime(game.time)}
        </h2>

        <div className="text-lg font-semibold text-gray-800 mb-4">
          {game.signups.in.length} in • {game.signups.out.length} out • {regularsRemaining(game)} regulars remaining
        </div>

        {/* Game Status */}
        <div className={`text-2xl font-bold py-3 rounded mb-4 text-center ${
          getGameStatus(game).includes('GAME ON')
            ? 'bg-green-100 text-green-800'
            : getGameStatus(game).includes('NO GAME')
            ? 'bg-red-100 text-red-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {getGameStatus(game)}
          <div className="text-sm font-normal mt-2">
            ⏱️ Game starts in: {countdowns.gameStart || 'calculating...'}
          </div>
        </div>

        {/* Deadline Info */}
        {isSignupOpen(game) ? (
          <div>
            <p className="text-sm text-gray-600 mb-2">
              ✅ <strong>Signups open</strong> until {formatDeadlineDate(game.signupDeadline)} 6PM
            </p>
            <p className="text-xs text-blue-600 font-semibold">
              ⏱️ Closes in: {countdowns.signupDeadline || 'loading...'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-orange-600">
            {hasGameStarted(game)
              ? '🔒 Game has started — signups are closed'
              : <>⚠️ <strong>Deadline passed</strong> ({formatDeadlineDate(game.signupDeadline)} 6PM) — late signups accepted until game starts</>
            }
          </p>
        )}

        {!isSignupOpen(game) && game.signups.in.length < 6 && (
          <p className="text-sm text-red-600 mt-2">
            ⚠️ Game cancelled - fewer than 6 signed up
          </p>
        )}
      </div>

      {/* Signups */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="font-bold text-gray-900 mb-4">Signups</h3>
        <div className="space-y-2 mb-6">
          {game.signups.in.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-900 flex-1">
                {s.name}
                {s.note && <span className="text-xs text-gray-400 ml-1">— {s.note}</span>}
              </span>
              {s.late && <span className="text-xs text-orange-500">(late)</span>}
              {s.source_url ? (
                <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600" title="View source message">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                </a>
              ) : s.source_type === 'site' ? (
                <span className="text-xs text-gray-300" title="Signed up on site">web</span>
              ) : s.source_type === 'email' ? (
                <span className="text-xs text-gray-300" title="Via email">email</span>
              ) : null}
            </div>
          ))}
          {game.signups.out.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-900 flex-1">
                {s.name}
                {s.note && <span className="text-xs text-gray-400 ml-1">— {s.note}</span>}
              </span>
              {s.late && <span className="text-xs text-orange-500">(late)</span>}
              {s.source_url ? (
                <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600" title="View source message">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                </a>
              ) : s.source_type === 'site' ? (
                <span className="text-xs text-gray-300" title="Signed up on site">web</span>
              ) : s.source_type === 'email' ? (
                <span className="text-xs text-gray-300" title="Via email">email</span>
              ) : null}
            </div>
          ))}
          {game.regulars
            .filter(r => !signedNames(game).has(r))
            .map((regular) => (
              <div key={regular} className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-gray-500 flex-1">{regular}</span>
                <span className="text-xs text-gray-400">(waiting)</span>
              </div>
            ))}
        </div>

        {/* Your Signup */}
        {onSignup && (
          <div className="border-t pt-4">
            <h3 className="font-bold text-gray-900 mb-3">🎯 Your Signup</h3>
            {hasGameStarted(game) ? (
              <p className="text-sm text-gray-500">Game has started — signups are closed.</p>
            ) : (
              <>
                {!isSignupOpen(game) && (
                  <p className="text-xs text-orange-500 mb-2">Deadline has passed — your signup will be marked as late</p>
                )}
                <input
                  type="text"
                  placeholder="Your name"
                  value={playerName}
                  onChange={(e) => onPlayerNameChange?.(e.target.value)}
                  className="w-full p-2 border rounded mb-4 text-gray-900 placeholder-gray-400"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => onSignup(game.id, playerName, 'in')}
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
                    onClick={() => onSignup(game.id, playerName, 'out')}
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
