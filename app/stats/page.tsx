'use client'

import { useEffect, useState } from 'react';

interface GameStat {
  id: string;
  date: string;
  time: string;
  inCount: number;
  outCount: number;
}

interface PlayerStat {
  name: string;
  gamesIn: number;
  gamesOut: number;
  totalSignups: number;
  lateSignups: number;
  statusChanges: number;
  attendanceRate: number;
}

interface Summary {
  totalGames: number;
  totalPlayers: number;
  avgAttendance: number;
  maxAttendance: number;
  minAttendance: number;
}

interface HistoricalGame {
  date: string;
  inCount: number;
  outCount: number;
}

interface HistoricalPlayer {
  name: string;
  gamesIn: number;
  gamesOut: number;
  attendanceRate: number;
}

interface StatsData {
  games: GameStat[];
  players: PlayerStat[];
  summary: Summary;
  historical?: {
    games: HistoricalGame[];
    players: HistoricalPlayer[];
  };
}

const TIMEZONE = 'America/Los_Angeles';

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: TIMEZONE,
  });
  return formatter.format(date);
}

function BarChart({ games }: { games: GameStat[] }) {
  if (games.length === 0) return <p className="text-gray-500">No games yet.</p>;

  const maxCount = Math.max(...games.map(g => g.inCount), 1);
  const barWidth = Math.max(Math.floor(600 / games.length) - 4, 12);
  const chartHeight = 200;
  const chartWidth = Math.max(games.length * (barWidth + 4), 300);
  const yStep = Math.max(Math.ceil(maxCount / 5), 1);
  const yMax = Math.ceil(maxCount / yStep) * yStep;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartWidth + 50} ${chartHeight + 40}`}
        className="w-full min-w-[300px]"
        style={{ maxWidth: `${chartWidth + 50}px` }}
      >
        {/* Y-axis labels */}
        {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => {
          const val = i * yStep;
          const y = chartHeight - (val / yMax) * chartHeight + 10;
          return (
            <text key={`y-${i}`} x="25" y={y + 4} textAnchor="end" className="fill-gray-400 text-[10px]">
              {val}
            </text>
          );
        })}

        {/* Horizontal grid lines */}
        {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => {
          const val = i * yStep;
          const y = chartHeight - (val / yMax) * chartHeight + 10;
          return (
            <line key={`grid-${i}`} x1="30" y1={y} x2={chartWidth + 40} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
          );
        })}

        {/* Bars */}
        {games.map((game, i) => {
          const barHeight = (game.inCount / yMax) * chartHeight;
          const x = 35 + i * (barWidth + 4);
          const y = chartHeight - barHeight + 10;
          const isGameOn = game.inCount >= 6;
          return (
            <g key={game.id}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="2"
                className={isGameOn ? 'fill-blue-500' : 'fill-blue-300'}
              />
              {/* Count label */}
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-gray-600 text-[9px] font-medium"
              >
                {game.inCount}
              </text>
              {/* Date label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 24}
                textAnchor="middle"
                className="fill-gray-500 text-[8px]"
                transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight + 24})`}
              >
                {formatDate(game.date)}
              </text>
            </g>
          );
        })}

        {/* 6-player threshold line */}
        {yMax >= 6 && (
          <>
            <line
              x1="30"
              y1={chartHeight - (6 / yMax) * chartHeight + 10}
              x2={chartWidth + 40}
              y2={chartHeight - (6 / yMax) * chartHeight + 10}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="4,3"
            />
            <text
              x={chartWidth + 42}
              y={chartHeight - (6 / yMax) * chartHeight + 14}
              className="fill-red-400 text-[9px]"
            >
              min
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/stats')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
      })
      .then(data => setStats(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-white">Loading stats...</div>;
  if (error) return <div className="p-8 text-center text-red-300">{error}</div>;
  if (!stats) return null;

  const { games, players, summary, historical } = stats;
  const flakiest = [...players].sort((a, b) => b.statusChanges - a.statusChanges)[0];
  const histGames = historical?.games || [];
  const histPlayers = historical?.players || [];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
            Stats
          </h1>
          <p className="text-blue-100">Attendance analytics</p>
        </div>

        {/* Season Summary */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Season Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-700">{summary.totalGames}</div>
              <div className="text-sm text-gray-600">Total Games</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-700">{summary.totalPlayers}</div>
              <div className="text-sm text-gray-600">Players</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-700">{summary.avgAttendance}</div>
              <div className="text-sm text-gray-600">Avg Attendance</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-700">{summary.maxAttendance}</div>
              <div className="text-sm text-gray-600">Best Turnout</div>
            </div>
          </div>
        </div>

        {/* Attendance Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Attendance per Game</h2>
          <BarChart games={games} />
          <p className="text-xs text-gray-400 mt-2">
            Dashed red line = 6 player minimum. Darker bars = game played.
          </p>
        </div>

        {/* The Regulars Leaderboard */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">The Regulars</h2>
          {players.length === 0 ? (
            <p className="text-gray-500">No signups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-sm text-gray-500">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Player</th>
                    <th className="pb-2 pr-4 text-right">Games In</th>
                    <th className="pb-2 pr-4 text-right">Rate</th>
                    <th className="pb-2 text-right">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, i) => (
                    <tr key={player.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-gray-400 text-sm">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium text-gray-900">{player.name}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">
                        {player.gamesIn} / {summary.totalGames}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <span className={`font-semibold ${
                          player.attendanceRate >= 75 ? 'text-green-600' :
                          player.attendanceRate >= 50 ? 'text-blue-600' :
                          player.attendanceRate >= 25 ? 'text-yellow-600' :
                          'text-gray-400'
                        }`}>
                          {player.attendanceRate}%
                        </span>
                      </td>
                      <td className="py-2 text-right text-gray-500">{player.lateSignups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Flakiest Player Award */}
        {flakiest && flakiest.statusChanges > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Flakiest Player Award</h2>
            <p className="text-sm text-gray-500 mb-4">Most signup changes (in to out, or out to in)</p>
            <div className="flex items-center gap-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-4xl">~</div>
              <div>
                <div className="text-xl font-bold text-gray-900">{flakiest.name}</div>
                <div className="text-sm text-gray-600">
                  Changed their mind {flakiest.statusChanges} time{flakiest.statusChanges !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historical Data */}
        {histGames.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Historical Attendance (from email archives)</h2>
              <p className="text-sm text-gray-500 mb-4">
                Parsed from {histGames.length} games in the groups.io email list
              </p>
              <BarChart games={histGames.map((g, i) => ({
                id: `hist-${i}`,
                date: g.date,
                time: '09:00',
                inCount: g.inCount,
                outCount: g.outCount,
              }))} />
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">All-Time Player Stats</h2>
              <p className="text-sm text-gray-500 mb-4">Based on {histGames.length} historical games</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-sm text-gray-500">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Player</th>
                      <th className="pb-2 pr-4 text-right">Games In</th>
                      <th className="pb-2 pr-4 text-right">Games Out</th>
                      <th className="pb-2 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histPlayers.map((player, i) => (
                      <tr key={player.name} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-gray-400 text-sm">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium text-gray-900">{player.name}</td>
                        <td className="py-2 pr-4 text-right text-gray-700">{player.gamesIn}</td>
                        <td className="py-2 pr-4 text-right text-gray-500">{player.gamesOut}</td>
                        <td className="py-2 text-right">
                          <span className={`font-semibold ${
                            player.attendanceRate >= 50 ? 'text-green-600' :
                            player.attendanceRate >= 25 ? 'text-blue-600' :
                            'text-gray-400'
                          }`}>
                            {player.attendanceRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Back link */}
        <div className="text-center mt-8">
          <a href="/" className="text-white hover:text-blue-200 underline text-sm">
            Back to Games
          </a>
        </div>
      </div>
    </div>
  );
}
