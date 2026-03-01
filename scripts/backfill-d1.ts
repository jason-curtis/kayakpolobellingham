import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

interface ParsedGame {
  date: string;
  dayOfWeek: string;
  time: string;
  gameOn: boolean;
  noGame: boolean;
  players: { name: string; status: "in" | "out" }[];
  topicIds: string[];
  topicTitles: string[];
}

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const PARSED_FILE = resolve(SCRIPT_DIR, "data/parsed-games.json");
const SQL_FILE = resolve(SCRIPT_DIR, "data/backfill.sql");

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function main() {
  const games: ParsedGame[] = JSON.parse(readFileSync(PARSED_FILE, "utf-8"));
  console.log(`Loaded ${games.length} parsed games`);

  const lines: string[] = [];

  lines.push("-- Backfill historical games and attendance from email scraping");
  lines.push("-- Generated at " + new Date().toISOString());
  lines.push("");

  // Create attendance_history table if not exists
  lines.push(`CREATE TABLE IF NOT EXISTS attendance_history (
  id TEXT PRIMARY KEY,
  game_date TEXT NOT NULL,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT DEFAULT 'email',
  created_at TEXT NOT NULL
);`);
  lines.push("");
  lines.push("CREATE INDEX IF NOT EXISTS idx_ah_date ON attendance_history(game_date);");
  lines.push("CREATE INDEX IF NOT EXISTS idx_ah_player ON attendance_history(player_name);");
  lines.push("");

  // Clear existing historical data (idempotent)
  lines.push("DELETE FROM attendance_history WHERE source = 'email';");
  lines.push("DELETE FROM games WHERE status = 'completed' AND id LIKE 'hist-%';");
  lines.push("");

  let totalRecords = 0;
  let totalGames = 0;

  for (const game of games) {
    // Insert historical game into games table
    const gameId = `hist-${escapeSql(game.date)}-${escapeSql(game.time)}`;
    const now = new Date().toISOString();
    const deadline = `${game.date}T${game.time}:00`;
    const status = "completed";
    lines.push(
      `INSERT OR IGNORE INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES ('${gameId}', '${escapeSql(game.date)}', '${escapeSql(game.time)}', '${deadline}', '${status}', '${now}', '${now}');`
    );
    totalGames++;

    if (game.players.length === 0) continue;

    for (const player of game.players) {
      const id = randomUUID();
      lines.push(
        `INSERT INTO attendance_history (id, game_date, player_name, status, source, created_at) VALUES ('${id}', '${escapeSql(game.date)}', '${escapeSql(player.name)}', '${player.status}', 'email', '${now}');`
      );
      totalRecords++;
    }
  }

  lines.push("");
  lines.push(`-- Total: ${totalGames} games, ${totalRecords} attendance records`);

  writeFileSync(SQL_FILE, lines.join("\n"));
  console.log(`Generated ${SQL_FILE}`);
  console.log(`Total attendance records: ${totalRecords}`);
  console.log(`Games with signups: ${games.filter(g => g.players.length > 0).length}`);
}

main();
