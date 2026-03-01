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
  lines.push("");

  let totalRecords = 0;

  for (const game of games) {
    if (game.players.length === 0) continue;

    for (const player of game.players) {
      const id = randomUUID();
      const now = new Date().toISOString();
      lines.push(
        `INSERT INTO attendance_history (id, game_date, player_name, status, source, created_at) VALUES ('${id}', '${escapeSql(game.date)}', '${escapeSql(player.name)}', '${player.status}', 'email', '${now}');`
      );
      totalRecords++;
    }
  }

  lines.push("");
  lines.push(`-- Total: ${totalRecords} attendance records across ${games.length} games`);

  writeFileSync(SQL_FILE, lines.join("\n"));
  console.log(`Generated ${SQL_FILE}`);
  console.log(`Total attendance records: ${totalRecords}`);
  console.log(`Games with signups: ${games.filter(g => g.players.length > 0).length}`);
}

main();
