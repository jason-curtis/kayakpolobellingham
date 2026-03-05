/**
 * Batch parser: reads scraped topics from data/emails.json, writes parsed games to data/parsed-games.json.
 * All parsing logic lives in lib/email-parser.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { aggregateTopicsIntoGames, type Topic, type ParsedGame } from "../lib/email-parser";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const DATA_FILE = resolve(SCRIPT_DIR, "data/emails.json");
const OUTPUT_FILE = resolve(SCRIPT_DIR, "data/parsed-games.json");

function main() {
  console.log("=== Kayak Polo Signup Parser ===\n");

  const topics: Topic[] = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  console.log(`Loaded ${topics.length} topics`);

  const games = aggregateTopicsIntoGames(topics);

  const totalGames = games.length;
  const gamesWithPlayers = games.filter((g) => g.players.length > 0).length;
  const gameOnCount = games.filter((g) => g.gameOn).length;
  const noGameCount = games.filter((g) => g.noGame && !g.gameOn).length;

  console.log("\n=== Results ===");
  console.log(`Total game dates: ${totalGames}`);
  console.log(`Games with signups: ${gamesWithPlayers}`);
  console.log(`Games On: ${gameOnCount}`);
  console.log(`No Game: ${noGameCount}`);

  console.log("\n=== Games ===");
  for (const game of games) {
    const inPlayers = game.players.filter((p) => p.status === "in").map((p) => p.name);
    const outPlayers = game.players.filter((p) => p.status === "out").map((p) => p.name);
    const status =
      game.noGame && !game.gameOn
        ? "NO GAME"
        : game.gameOn
          ? "GAME ON"
          : inPlayers.length >= 6
            ? "PLAYED?"
            : "UNKNOWN";
    console.log(
      `${game.date} (${game.dayOfWeek}) ${game.time} [${status}] IN:${inPlayers.length} OUT:${outPlayers.length}`
    );
    if (inPlayers.length > 0) console.log(`  In: ${inPlayers.join(", ")}`);
    if (outPlayers.length > 0) console.log(`  Out: ${outPlayers.join(", ")}`);
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(games, null, 2));
  console.log(`\nSaved ${games.length} parsed games to ${OUTPUT_FILE}`);
}

main();
