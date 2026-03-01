import { readFileSync } from "fs";
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

// Configure these
const BASE_URL = process.env.BASE_URL || "https://kayakpolosignups.option-zero.workers.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "marine park tides swirl";

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
    redirect: "manual",
  });

  // Extract cookie from Set-Cookie header
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Login failed: no cookie returned (status ${res.status})`);
  }

  const match = setCookie.match(/admin_session=([^;]+)/);
  if (!match) {
    throw new Error("Login failed: no admin_session cookie");
  }

  console.log("Logged in successfully");
  return `admin_session=${match[1]}`;
}

async function main() {
  const games: ParsedGame[] = JSON.parse(readFileSync(PARSED_FILE, "utf-8"));
  console.log(`Loaded ${games.length} parsed games`);

  // Build records
  const now = new Date().toISOString();
  const records = [];
  for (const game of games) {
    for (const player of game.players) {
      records.push({
        id: randomUUID(),
        game_date: game.date,
        player_name: player.name,
        status: player.status,
        source: "email",
        created_at: now,
      });
    }
  }

  console.log(`Total records to insert: ${records.length}`);

  // Login
  const cookie = await login();

  // Send in chunks (API has size limits)
  const chunkSize = 200;
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    console.log(
      `Sending chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(records.length / chunkSize)} (${chunk.length} records)...`
    );

    const res = await fetch(`${BASE_URL}/api/admin/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ records: chunk }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Backfill failed (${res.status}): ${body}`);
    }

    const result = await res.json();
    totalInserted += (result as any).inserted;
    console.log(`  Inserted: ${(result as any).inserted}`);
  }

  console.log(`\nDone! Total inserted: ${totalInserted}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
