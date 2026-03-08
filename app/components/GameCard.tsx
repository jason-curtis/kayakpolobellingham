'use client'

import { useEffect, useState } from 'react';
import { getTimeRemaining, formatCountdown, formatCountdownLong } from '@/lib/countdown';
import TideChart from './TideChart';
import WeatherForecast from './WeatherForecast';

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
    maybe: SignupEntry[];
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

export type GameState = 'game_on' | 'need_more' | 'cancelled';

export function getGameState(game: Game): GameState {
  const now = new Date();
  const deadline = new Date(game.signupDeadline);
  const signupCount = game.signups.in.length;
  if (signupCount >= 6) return 'game_on';
  if (now <= deadline) return 'need_more';
  return 'cancelled';
}

export function getGameStatus(game: Game) {
  const state = getGameState(game);
  const signupCount = game.signups.in.length;
  switch (state) {
    case 'game_on': return 'Game on!';
    case 'need_more': return `Have ${signupCount}, need ${6 - signupCount} more`;
    case 'cancelled': return 'Cancelled';
  }
}

function signedNames(game: Game) {
  return new Set([
    ...game.signups.in.map(s => s.name),
    ...game.signups.out.map(s => s.name),
    ...(game.signups.maybe ?? []).map(s => s.name),
  ]);
}

interface GameCardProps {
  game: Game;
  onSignup?: (gameId: string, playerName: string, status: 'in' | 'out' | 'maybe') => Promise<void>;
  playerName?: string;
  onPlayerNameChange?: (name: string) => void;
  isSubmitting?: boolean;
}

function SourceIndicator({ entry }: { entry: SignupEntry }) {
  if (entry.source_url) {
    return (
      <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600" title="View source">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
      </a>
    );
  }
  if (entry.source_type === 'site') return <span className="text-xs text-gray-300">web</span>;
  if (entry.source_type === 'email') return <span className="text-xs text-gray-300">email</span>;
  return null;
}

function SignupRow({ entry, dotColor, dimName }: { entry: SignupEntry; dotColor: string; dimName?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
      <span className={`text-sm flex-1 ${dimName ? 'text-gray-500' : 'text-gray-900'}`}>
        {entry.name}
        {entry.note && <span className="text-xs text-gray-400 ml-1">— {entry.note}</span>}
      </span>
      {entry.late && <span className="text-xs text-orange-500">late</span>}
      <SourceIndicator entry={entry} />
    </div>
  );
}

export default function GameCard({ game, onSignup, playerName = '', onPlayerNameChange, isSubmitting = false }: GameCardProps) {
  const [countdowns, setCountdowns] = useState({ gameStart: '', signupDeadline: '' });
  const state = getGameState(game);

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

  const inCount = game.signups.in.length;
  const outCount = game.signups.out.length;
  const maybeCount = game.signups.maybe?.length ?? 0;

  const summaryParts = [`${inCount} in`];
  if (outCount > 0) summaryParts.push(`${outCount} out`);
  if (maybeCount > 0) summaryParts.push(`${maybeCount} maybe`);

  return (
    <div className="space-y-4">
      {/* Game Header & Status */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-2xl font-bold text-gray-900">
            {formatGameDate(game.date)} · {formatGameTime(game.time)}
          </h2>
          <span className="text-sm text-gray-500">{summaryParts.join(' · ')}</span>
        </div>

        {/* Status */}
        <div className={`text-xl font-bold py-3 rounded text-center ${
          state === 'game_on' ? 'bg-green-100 text-green-800'
            : state === 'cancelled' ? 'bg-red-100 text-red-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {getGameStatus(game)}
        </div>

        {/* Timing */}
        {!hasGameStarted(game) && (
          <p className="text-sm text-gray-500 text-center mt-3">
            {isSignupOpen(game)
              ? `Signups close in ${countdowns.signupDeadline || '...'}`
              : state === 'game_on'
                ? `Late signups open · starts in ${countdowns.gameStart || '...'}`
                : state === 'cancelled'
                  ? 'Not enough players signed up'
                  : null
            }
          </p>
        )}
        {hasGameStarted(game) && (
          <p className="text-sm text-gray-500 text-center mt-3">Game started · signups closed</p>
        )}
      </div>

      {/* Tides & Weather */}
      <TideChart date={game.date} gameTime={game.time} />
      <WeatherForecast date={game.date} gameTime={game.time} />

      {/* Signups */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Signups</h3>
        <div className="space-y-1.5 mb-6">
          {game.signups.in.map((s) => (
            <SignupRow key={s.name} entry={s} dotColor="bg-green-500" />
          ))}
          {game.signups.out.map((s) => (
            <SignupRow key={s.name} entry={s} dotColor="bg-red-500" dimName />
          ))}
          {(game.signups.maybe ?? []).map((s) => (
            <SignupRow key={s.name} entry={s} dotColor="bg-yellow-400" dimName />
          ))}
          {game.regulars
            .filter(r => !signedNames(game).has(r))
            .map((regular) => (
              <div key={regular} className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                <span className="text-sm text-gray-400 flex-1">{regular}</span>
              </div>
            ))}
        </div>

        {/* Your Signup */}
        {onSignup && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-3">Your Signup</h3>
            {hasGameStarted(game) ? (
              <p className="text-sm text-gray-500">Signups are closed.</p>
            ) : (
              <>
                {!isSignupOpen(game) && (
                  <p className="text-xs text-orange-500 mb-2">Deadline passed — your signup will be marked as late</p>
                )}
                <input
                  type="text"
                  placeholder="Your name"
                  value={playerName}
                  onChange={(e) => onPlayerNameChange?.(e.target.value)}
                  className="w-full p-2 border rounded mb-3 text-sm text-gray-900 placeholder-gray-400"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => onSignup(game.id, playerName, 'in')}
                    disabled={isSubmitting || !playerName.trim()}
                    className={`flex-1 p-2.5 rounded font-semibold text-sm transition ${
                      isSubmitting || !playerName.trim()
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    I'm In
                  </button>
                  <button
                    onClick={() => onSignup(game.id, playerName, 'maybe')}
                    disabled={isSubmitting || !playerName.trim()}
                    className={`flex-1 p-2.5 rounded font-semibold text-sm transition ${
                      isSubmitting || !playerName.trim()
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                    }`}
                  >
                    Maybe
                  </button>
                  <button
                    onClick={() => onSignup(game.id, playerName, 'out')}
                    disabled={isSubmitting || !playerName.trim()}
                    className={`flex-1 p-2.5 rounded font-semibold text-sm transition ${
                      isSubmitting || !playerName.trim()
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-red-500 text-white hover:bg-red-600'
                    }`}
                  >
                    I'm Out
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
