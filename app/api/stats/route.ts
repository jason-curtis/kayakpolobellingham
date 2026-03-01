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

    // Per-game signup counts (only "in" status)
    const gamesWithCounts = games.map((game: any) => {
      const gameSignups = signups.filter((s: any) => s.game_id === game.id);
      const inCount = gameSignups.filter((s: any) => s.status === 'in').length;
      const outCount = gameSignups.filter((s: any) => s.status === 'out').length;
      return {
        id: game.id,
        date: game.date,
        time: game.time,
        inCount,
        outCount,
      };
    });

    // Per-player attendance stats
    const playerMap: Record<string, { gamesIn: number; gamesOut: number; lateSignups: number; statusChanges: number }> = {};

    for (const s of signups as any[]) {
      if (!playerMap[s.player_name]) {
        playerMap[s.player_name] = { gamesIn: 0, gamesOut: 0, lateSignups: 0, statusChanges: 0 };
      }
      const p = playerMap[s.player_name];
      if (s.status === 'in') p.gamesIn++;
      if (s.status === 'out') p.gamesOut++;
      if (s.late) p.lateSignups++;
      // Detect status changes: if created_at !== updated_at, player changed their signup
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

    // Sort by attendance rate descending
    players.sort((a, b) => b.attendanceRate - a.attendanceRate);

    // Summary stats
    const totalSignupsIn = signups.filter((s: any) => s.status === 'in').length;
    const avgAttendance = totalGames > 0 ? Math.round((totalSignupsIn / totalGames) * 10) / 10 : 0;
    const maxAttendance = Math.max(...gamesWithCounts.map((g: any) => g.inCount), 0);
    const minAttendance = gamesWithCounts.length > 0
      ? Math.min(...gamesWithCounts.map((g: any) => g.inCount))
      : 0;

    // Historical attendance from email scraping
    let historicalGames: any[] = [];
    let historicalPlayers: any[] = [];
    try {
      const { results: history } = await db.prepare(
        'SELECT game_date, player_name, status FROM attendance_history ORDER BY game_date ASC'
      ).all();

      if (history && history.length > 0) {
        // Group by game_date
        const histGameMap: Record<string, { inCount: number; outCount: number }> = {};
        const histPlayerMap: Record<string, { gamesIn: number; gamesOut: number }> = {};

        for (const h of history as any[]) {
          if (!histGameMap[h.game_date]) {
            histGameMap[h.game_date] = { inCount: 0, outCount: 0 };
          }
          if (h.status === 'in') histGameMap[h.game_date].inCount++;
          if (h.status === 'out') histGameMap[h.game_date].outCount++;

          if (!histPlayerMap[h.player_name]) {
            histPlayerMap[h.player_name] = { gamesIn: 0, gamesOut: 0 };
          }
          if (h.status === 'in') histPlayerMap[h.player_name].gamesIn++;
          if (h.status === 'out') histPlayerMap[h.player_name].gamesOut++;
        }

        historicalGames = Object.entries(histGameMap)
          .map(([date, counts]) => ({ date, ...counts }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const histTotalGames = historicalGames.length;
        historicalPlayers = Object.entries(histPlayerMap)
          .map(([name, stats]) => ({
            name,
            gamesIn: stats.gamesIn,
            gamesOut: stats.gamesOut,
            attendanceRate: histTotalGames > 0 ? Math.round((stats.gamesIn / histTotalGames) * 100) : 0,
          }))
          .sort((a, b) => b.gamesIn - a.gamesIn);
      }
    } catch {
      // attendance_history table might not exist yet
    }

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
      historical: {
        games: historicalGames,
        players: historicalPlayers,
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
