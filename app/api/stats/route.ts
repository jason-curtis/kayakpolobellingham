import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

async function getDB() {
  const { env } = await getCloudflareContext();
  return (env as any).D1_DB;
}

export async function GET() {
  try {
    const db = await getDB();

    // All games ordered by date
    const { results: games } = await db.prepare(
      'SELECT id, date, time, status FROM games ORDER BY date ASC'
    ).all();

    // All signups with game dates
    const { results: signups } = await db.prepare(
      `SELECT s.game_id, s.player_name, s.status, s.late, s.created_at, s.updated_at, g.date as game_date
       FROM signups s
       JOIN games g ON s.game_id = g.id
       ORDER BY g.date ASC`
    ).all();

    // Per-game signup counts
    const gamesWithCounts = games.map((game: any) => {
      const gameSignups = signups.filter((s: any) => s.game_id === game.id);
      const inCount = gameSignups.filter((s: any) => s.status === 'in').length;
      const outCount = gameSignups.filter((s: any) => s.status === 'out').length;
      return { id: game.id, date: game.date, time: game.time, inCount, outCount };
    });

    // Per-player stats
    const playerMap: Record<string, { gamesIn: number; gamesOut: number; lateSignups: number; statusChanges: number }> = {};

    for (const s of signups as any[]) {
      if (!playerMap[s.player_name]) {
        playerMap[s.player_name] = { gamesIn: 0, gamesOut: 0, lateSignups: 0, statusChanges: 0 };
      }
      const p = playerMap[s.player_name];
      if (s.status === 'in') p.gamesIn++;
      if (s.status === 'out') p.gamesOut++;
      if (s.late) p.lateSignups++;
      if (s.created_at !== s.updated_at) p.statusChanges++;
    }

    const totalGames = games.length;
    const players = Object.entries(playerMap).map(([name, stats]) => ({
      name,
      gamesIn: stats.gamesIn,
      gamesOut: stats.gamesOut,
      totalSignups: stats.gamesIn + stats.gamesOut,
      lateSignups: stats.lateSignups,
      statusChanges: stats.statusChanges,
      attendanceRate: totalGames > 0 ? Math.round((stats.gamesIn / totalGames) * 100) : 0,
    }));
    players.sort((a, b) => b.attendanceRate - a.attendanceRate);

    const totalSignupsIn = signups.filter((s: any) => s.status === 'in').length;
    const avgAttendance = totalGames > 0 ? Math.round((totalSignupsIn / totalGames) * 10) / 10 : 0;
    const maxAttendance = Math.max(...gamesWithCounts.map((g: any) => g.inCount), 0);
    const minAttendance = gamesWithCounts.length > 0
      ? Math.min(...gamesWithCounts.map((g: any) => g.inCount))
      : 0;

    return NextResponse.json({
      games: gamesWithCounts,
      players,
      summary: {
        totalGames,
        totalPlayers: Object.keys(playerMap).length,
        avgAttendance,
        maxAttendance,
        minAttendance,
      },
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
