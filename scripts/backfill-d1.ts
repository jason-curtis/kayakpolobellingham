import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import type { ParsedGame } from "../lib/email-parser";

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

  lines.push("-- Backfill historical games and signups from email scraping");
  lines.push("-- Generated at " + new Date().toISOString());
  lines.push("");

  // Clear existing historical data (idempotent)
  lines.push("DELETE FROM signups WHERE game_id LIKE 'hist-%';");
  lines.push("DELETE FROM games WHERE id LIKE 'hist-%';");
  lines.push("");

  let totalSignups = 0;
  let totalGames = 0;
  const now = new Date().toISOString();

  for (const game of games) {
    const gameId = `hist-${escapeSql(game.date)}-${escapeSql(game.time)}`;
    const deadline = `${game.date}T${game.time}:00`;
    const status = "completed";
    lines.push(
      `INSERT OR IGNORE INTO games (id, date, time, signup_deadline, status, created_at, updated_at) VALUES ('${gameId}', '${escapeSql(game.date)}', '${escapeSql(game.time)}', '${deadline}', '${status}', '${now}', '${now}');`
    );
    totalGames++;

    for (const player of game.players) {
      const id = randomUUID();
      lines.push(
        `INSERT OR IGNORE INTO signups (id, game_id, player_name, status, late, created_at, updated_at) VALUES ('${id}', '${gameId}', '${escapeSql(player.name)}', '${player.status}', 0, '${now}', '${now}');`
      );
      totalSignups++;
    }
  }

  lines.push("");
  lines.push(`-- Total: ${totalGames} games, ${totalSignups} signups`);

  writeFileSync(SQL_FILE, lines.join("\n"));
  console.log(`Generated ${SQL_FILE}`);
  console.log(`Total games: ${totalGames}`);
  console.log(`Total signups: ${totalSignups}`);
}

main();
