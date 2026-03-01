import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  sender: string;
  date: string;
  body: string;
}

interface Topic {
  topicId: string;
  title: string;
  url: string;
  messages: Message[];
}

interface ParsedGame {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  time: string; // "09:00" or "18:00"
  gameOn: boolean;
  noGame: boolean;
  players: { name: string; status: "in" | "out" }[];
  topicIds: string[];
  topicTitles: string[];
}

// ── Config ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const DATA_FILE = resolve(SCRIPT_DIR, "data/emails.json");
const OUTPUT_FILE = resolve(SCRIPT_DIR, "data/parsed-games.json");

// ── Name aliasing ──────────────────────────────────────────────────────────

// Map known nicknames / short names → canonical name
const NAME_ALIASES: Record<string, string> = {
  dor: "Dorothy",
  db: "Dorothy",
  "dorothy burke": "Dorothy",
  dorothy: "Dorothy",
  gary: "Gary",
  gs: "Gary",
  g: "Gary",
  gsouthstone: "Gary",
  glenno: "Glenn",
  glen: "Glenn",
  glenn: "Glenn",
  "glenn biernacki": "Glenn",
  dave: "Dave",
  dberger007: "Dave",
  jason: "Jason",
  bubbles: "Jason",
  "jason curtis": "Jason",
  paul: "Paul",
  "paul burkhouse": "Paul",
  genaro: "Genaro",
  "genaro shaffer": "Genaro",
  cam: "Cameron",
  cameron: "Cameron",
  "cameron berg": "Cameron",
  buddy: "Buddy",
  "buddy bomze": "Buddy",
  mark: "Mark",
  "mark lisowski": "Mark",
  aaron: "Aaron",
  "aaron dutton": "Aaron",
  mike: "Mike",
  "mike mills": "Mike",
  melissa: "Melissa",
  "melissa bertocchini": "Melissa",
  sarah: "Sarah",
  "sarah hare": "Sarah",
  kevin: "Kevin",
  ryan: "Ryan",
  "ryan vasak": "Ryan",
  jer: "Jerimiah",
  jerimiah: "Jerimiah",
  "jerimiah welch": "Jerimiah",
  jerimiahwelch: "Jerimiah",
  matt: "Matt",
  "matt goodwin": "Matt",
  liz: "Liz",
  "liz donovan": "Liz",
  "daddy": "Gary",
  "needle nose": "Glenn",
  "grumpy": "Dave",
  "gimpy": "Dave",
  "grump": "Dave",
  "other grump": "Dave",
  "dorth": "Dorothy",
  "dorthvader": "Dorothy",
  "d and g": "Dorothy",
  "a-aron": "Aaron",
  "mel": "Melissa",
  "mellissa": "Melissa",
  "maryanne": "Maryann",
  "kev": "Kevin",
  "kevin murphy": "Kevin",
  "nick": "Nick",
  "dane": "Dane",
  "genero": "Genaro",
  "tim": "Tim",
  "sheila": "Sheila",
  "christine": "Christine",
  "chloe": "Chloe",
  "jimmy": "Jimmy",
  steve: "Steve",
  "sgibson.home": "Steve",
  conor: "Conor",
  "cari lou": "Cari",
  cari: "Cari",
  "maryann schmitt": "Maryann",
  maryann: "Maryann",
  "adam bierschenk": "Adam",
  adam: "Adam",
  gib: "Gib",
  "gib morrow": "Gib",
  "james mcardle": "James",
  james: "James",
  "ben": "Ben",
};

// Map email sender names → canonical name
const SENDER_MAP: Record<string, string> = {
  "Dorothy Burke": "Dorothy",
  gsouthstone: "Gary",
  "glenn biernacki": "Glenn",
  dberger007: "Dave",
  "Jason Curtis": "Jason",
  "Paul Burkhouse": "Paul",
  "Genaro Shaffer": "Genaro",
  "Cameron Berg": "Cameron",
  "Buddy Bomze": "Buddy",
  "Mark Lisowski": "Mark",
  "Aaron Dutton": "Aaron",
  "Mike Mills": "Mike",
  "Melissa Bertocchini": "Melissa",
  "Sarah Hare": "Sarah",
  Kevin: "Kevin",
  "Ryan Vasak": "Ryan",
  jerimiahwelch: "Jerimiah",
  "Jerimiah Welch": "Jerimiah",
  "Matt Goodwin": "Matt",
  "Liz Donovan": "Liz",
  "Gib Morrow": "Gib",
  "Cari Lou": "Cari",
  "Maryann Schmitt": "Maryann",
  "adam bierschenk": "Adam",
  "James McArdle": "James",
  "sgibson.home": "Steve",
  bflannelly50: "Brian",
};

function resolveName(name: string): string {
  let trimmed = name.trim();
  if (!trimmed) return "";
  // Strip trailing possessive 's
  trimmed = trimmed.replace(/'s$/i, "");
  if (!trimmed) return "";
  // Try direct lookup
  const lower = trimmed.toLowerCase();
  if (NAME_ALIASES[lower]) return NAME_ALIASES[lower];
  // Try sender map
  if (SENDER_MAP[trimmed]) return SENDER_MAP[trimmed];
  // Capitalize first letter
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function resolveSender(sender: string): string {
  if (SENDER_MAP[sender]) return SENDER_MAP[sender];
  return resolveName(sender);
}

// ── Date parsing from topic titles ─────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseDateFromTitle(
  title: string,
  firstMessageDate: string
): string | null {
  const t = title.toLowerCase().replace(/[,\.]/g, " ").replace(/\s+/g, " ");

  // Infer year from first message date
  let refYear = 2025;
  if (firstMessageDate) {
    const y = parseInt(firstMessageDate.substring(0, 4));
    if (!isNaN(y)) refYear = y;
  }

  // Pattern: M/D/YY or M/D/YYYY (e.g., "3/1/26", "7/14/24", "1/11/16")
  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    // Fix obvious typo: 1/11/16 should be 2026 based on context
    if (year === 2016 && refYear >= 2025) year = 2026;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Pattern: M/D (no year, e.g., "8/27", "9/10")
  m = t.match(/(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${refYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Pattern: Month Day, Year (e.g., "Jan 4, 2025", "July 27, 2025")
  const monthNames = Object.keys(MONTHS).join("|");
  const re1 = new RegExp(`(${monthNames})\\w*\\s+(\\d{1,2})\\s*(?:,?\\s*(\\d{4}))?`);
  m = t.match(re1);
  if (m) {
    const monthKey = m[1].toLowerCase();
    const month = MONTHS[monthKey];
    const day = parseInt(m[2]);
    const year = m[3] ? parseInt(m[3]) : refYear;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Pattern: ordinal date like "Sunday 19th", "Sunday the 10th", "Sunday 17th"
  m = t.match(/(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|weds?)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)/);
  if (m) {
    const day = parseInt(m[1]);
    // Need to figure out month from first message
    if (firstMessageDate && day >= 1 && day <= 31) {
      const refMonth = parseInt(firstMessageDate.substring(5, 7));
      const refDay = parseInt(firstMessageDate.substring(8, 10));
      // Use same month as reference, or next month if day is far ahead
      let month = refMonth;
      if (day < refDay - 14) month = refMonth + 1;
      if (month > 12) { month = 1; refYear++; }
      return `${refYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Pattern: "Sunday NYE" → Dec 31
  if (t.includes("nye")) {
    return `${refYear}-12-31`;
  }

  // Pattern: "Easter Sunday" → approximate
  if (t.includes("easter")) {
    // Easter 2025 = Apr 20, Easter 2024 = Mar 31
    if (refYear === 2025) return "2025-04-20";
    if (refYear === 2024) return "2024-03-31";
  }

  // Pattern: "Memorial Day" → last Monday of May
  if (t.includes("memorial day")) {
    return `${refYear}-05-26`; // approximate
  }

  // Pattern: "May Day" → May 1
  if (t.includes("may day")) {
    return `${refYear}-05-01`;
  }

  return null;
}

// ── Signup parsing from message bodies ─────────────────────────────────────

interface Signup {
  name: string;
  status: "in" | "out";
}

function parseSignupsFromMessage(
  body: string,
  sender: string
): Signup[] {
  const results: Signup[] = [];
  const resolvedSender = resolveSender(sender);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Skip quoted text, signatures, forwarded mail
    if (lower.startsWith("from:") || lower.startsWith("sent:") || lower.startsWith(">")) continue;
    if (lower.includes("yahoo mail") || lower.includes("mailto:")) continue;

    // Pattern: "I'm in" / "I'm out" / "I'll play" / "I'll be there" / "Count me in"
    // Check this BEFORE "Name in" to avoid matching "i'm" as a name
    if (/\bi'?m\s+in\b/.test(lower) || /\bi'?ll\s+play\b/.test(lower) || /\bi'?ll\s+be\s+there\b/.test(lower) || /\bcount\s+me\s+in\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "in" });
      continue;
    }
    if (/\bi'?m\s+out\b/.test(lower) || /\bi'?m\s+a?\s*no\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "out" });
      continue;
    }

    // Pattern: "Dor and Gary out" or "Dor and Gary in"
    const andPattern = lower.match(
      /^([a-z][a-z'\-]{1,15})\s+and\s+([a-z][a-z'\-]{1,15})\s+(in|out)\b/
    );
    if (andPattern) {
      const n1 = resolveName(andPattern[1]);
      const n2 = resolveName(andPattern[2]);
      const st = andPattern[3] as "in" | "out";
      if (n1 && !isBadName(n1)) results.push({ name: n1, status: st });
      if (n2 && !isBadName(n2)) results.push({ name: n2, status: st });
      continue;
    }

    // Pattern: "Dor and gary are in/out"
    const andArePattern = lower.match(
      /^([a-z][a-z'\-]{1,15})\s+and\s+([a-z][a-z'\-]{1,15})\s+(?:are\s+)?(in|out)\b/
    );
    if (andArePattern) {
      const n1 = resolveName(andArePattern[1]);
      const n2 = resolveName(andArePattern[2]);
      const st = andArePattern[3] as "in" | "out";
      if (n1 && !isBadName(n1)) results.push({ name: n1, status: st });
      if (n2 && !isBadName(n2)) results.push({ name: n2, status: st });
      continue;
    }

    // Pattern: "Name in" or "Name out"
    const nameInOut = lower.match(
      /^([a-z][a-z'\-]{1,15})\s+(in|out)\b/
    );
    if (nameInOut) {
      const name = resolveName(nameInOut[1]);
      if (name && name.length >= 2 && !isBadName(name)) {
        results.push({ name, status: nameInOut[2] as "in" | "out" });
        continue;
      }
    }

    // Pattern: "Name's in"
    const possessiveIn = lower.match(
      /^([a-z][a-z'\-]{1,15})(?:'s)\s+(in|out)\b/
    );
    if (possessiveIn) {
      const name = resolveName(possessiveIn[1]);
      if (name && name.length >= 2 && !isBadName(name)) {
        results.push({ name, status: possessiveIn[2] as "in" | "out" });
        continue;
      }
    }

    // Pattern: "G-in" or "G in"
    if (/^g[\- ]in\b/.test(lower)) {
      results.push({ name: "Gary", status: "in" });
      continue;
    }

    // Pattern: short "in" or "out" by itself → use sender name
    if (/^in[!.]?\s*$/.test(lower) || /^yes[!.]?\s*$/.test(lower) || /^yep[!.]?\s*$/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "in" });
      continue;
    }
    if (/^out[!.]?\s*$/.test(lower) || /^no[!.]?\s*$/.test(lower) || /^nay[!.]?\s*$/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "out" });
      continue;
    }
  }

  return results;
}

function parseRosterFromGameOn(body: string): string[] {
  // "Game On" messages often have comma-separated rosters
  // e.g., "Dor, Gary, Dave, Paul, Glenn, Bubbles"
  // e.g., "Game on: Gary is in, Dor, Glenn, Dave, Paul, Cam"

  const players: string[] = [];
  const text = body.replace(/Game\s*On\s*:?\s*/gi, "").trim();

  // Try splitting by commas and "and"
  const parts = text
    .split(/[,]|\band\b/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    // Extract just the name (first 1-2 words, skip descriptive text)
    const nameMatch = part.match(/^([A-Za-z][A-Za-z'\-]{1,15})/);
    if (nameMatch) {
      const name = resolveName(nameMatch[1]);
      if (name && name.length >= 2 && !isStopWord(name.toLowerCase()) && !isBadName(name)) {
        players.push(name);
      }
    }
  }

  return [...new Set(players)]; // deduplicate
}

function isStopWord(word: string): boolean {
  const stops = new Set([
    "the", "is", "in", "out", "on", "at", "for", "we", "will", "be",
    "there", "plus", "maybe", "arriving", "from", "to", "joined", "by",
    "who", "whoever", "else", "also", "too", "as", "an", "a", "of",
    "he", "she", "his", "her", "our", "with", "but", "not", "no",
    "game", "new", "keep", "posting", "still", "well", "if", "so",
    "ignore", "says", "playing", "their", "about", "posted", "sign",
    "this", "that", "very", "most", "just", "please", "post",
    "could", "leave", "yours", "which", "hopefully", "or", "see",
    "working", "thanks", "start", "slide", "btw", "change",
    "sounds", "like", "although", "it", "especially", "back",
    "counting", "depending", "etc", "considering", "teammates",
    "dress", "same", "last", "amounts", "give", "know", "march",
    "other", "while", "basking", "oh", "ok", "im", "um",
  ]);
  return stops.has(word);
}

// Names we know are definitely NOT player names (false positives from parsing)
function isBadName(name: string): boolean {
  const bad = new Set([
    "I'm", "Im", "If", "So", "Me", "We", "You", "Also",
    "Please", "Post", "Start", "Change", "Working", "Hopefully",
    "Considering", "Depending", "Etc", "Teammates", "Dress",
    "Although", "Especially", "Counting", "Amounts", "Give", "Know",
    "March", "Other", "While", "Basking", "Oh", "Ok",
    "Posted", "Sign", "Correctamundo", "Mittens", "Newbies-",
    "Um", "Aar-in", "Cam-a", "Gibbous", "Pb", "Gb",
    "Idave", "Rv", "Mab", "Dv", "Paulk", "Gar", "Oc",
    "Slide", "Btw", "Last", "Same", "Back", "Just",
    "Skirt", "Off", "Helmet", "Hannah", "Have", "Could",
    "Leave", "Yours", "Which", "Jerianne",
    "G-", "G-gear", "G-in", "Still", "Can", "I'll",
    "We're", "Say", "Support", "Sorry", "Er", "Arrived",
    "Go", "Makes", "Anyone", "Probably", "Family", "Myself",
    "Remember", "Il", "Did", "Some", "Let", "Paddle",
    "Meet", "Come", "Get", "Welches", "Stubby", "Chad",
    "Due", "Finagle", "Hangovers", "Feel", "Lane", "Robert",
  ]);
  return bad.has(name);
}

// ── Main parsing logic ─────────────────────────────────────────────────────

function main() {
  console.log("=== Kayak Polo Signup Parser ===\n");

  const topics: Topic[] = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  console.log(`Loaded ${topics.length} topics`);

  // Group topics by game date
  const gameMap = new Map<string, ParsedGame>();

  for (const topic of topics) {
    const firstMsgDate =
      topic.messages.length > 0 ? topic.messages[0].date : "";
    const gameDate = parseDateFromTitle(topic.title, firstMsgDate);

    if (!gameDate) {
      console.log(`  SKIP (no date): ${topic.title}`);
      continue;
    }

    // Determine if this is a sunday or wednesday game → set time
    const titleLower = topic.title.toLowerCase();
    const isWeds =
      titleLower.includes("weds") ||
      titleLower.includes("wednesday") ||
      titleLower.includes("wedd");
    const time = isWeds ? "18:00" : "09:00";

    // Get or create game entry
    const key = gameDate;
    if (!gameMap.has(key)) {
      const dateObj = new Date(`${gameDate}T12:00:00`);
      const days = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday",
      ];
      gameMap.set(key, {
        date: gameDate,
        dayOfWeek: days[dateObj.getDay()],
        time,
        gameOn: false,
        noGame: false,
        players: [],
        topicIds: [],
        topicTitles: [],
      });
    }

    const game = gameMap.get(key)!;
    game.topicIds.push(topic.topicId);
    game.topicTitles.push(topic.title);

    // Check if this is a "Game On" or "No Game" topic
    if (/game\s*on/i.test(topic.title)) {
      game.gameOn = true;
    }
    if (/no\s*game/i.test(topic.title)) {
      game.noGame = true;
    }

    // Parse signup messages
    const isGameOnTopic = /game\s*on/i.test(topic.title);

    for (const msg of topic.messages) {
      // Skip empty messages
      if (!msg.body.trim()) continue;

      // For "Game On" topics, the first message often has a roster
      if (isGameOnTopic && msg === topic.messages[0]) {
        const roster = parseRosterFromGameOn(msg.body);
        if (roster.length >= 3) {
          // This is likely a roster, all players are "in"
          for (const name of roster) {
            if (!game.players.find((p) => p.name === name)) {
              game.players.push({ name, status: "in" });
            }
          }
          continue;
        }
      }

      // Parse individual signup messages
      const signups = parseSignupsFromMessage(msg.body, msg.sender);
      for (const signup of signups) {
        if (isBadName(signup.name)) continue;
        // Update or add player
        const existing = game.players.find((p) => p.name === signup.name);
        if (existing) {
          existing.status = signup.status; // Later message wins
        } else {
          game.players.push(signup);
        }
      }
    }
  }

  // Convert to sorted array
  const games = [...gameMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Stats
  const totalGames = games.length;
  const gamesWithPlayers = games.filter((g) => g.players.length > 0).length;
  const gameOnCount = games.filter((g) => g.gameOn).length;
  const noGameCount = games.filter((g) => g.noGame && !g.gameOn).length;

  console.log(`\n=== Results ===`);
  console.log(`Total game dates: ${totalGames}`);
  console.log(`Games with signups: ${gamesWithPlayers}`);
  console.log(`Games On: ${gameOnCount}`);
  console.log(`No Game: ${noGameCount}`);

  // Print each game
  console.log(`\n=== Games ===`);
  for (const game of games) {
    const inPlayers = game.players
      .filter((p) => p.status === "in")
      .map((p) => p.name);
    const outPlayers = game.players
      .filter((p) => p.status === "out")
      .map((p) => p.name);
    const status = game.noGame && !game.gameOn
      ? "NO GAME"
      : game.gameOn
      ? "GAME ON"
      : inPlayers.length >= 6
      ? "PLAYED?"
      : "UNKNOWN";

    console.log(
      `${game.date} (${game.dayOfWeek}) ${game.time} [${status}] IN:${inPlayers.length} OUT:${outPlayers.length}`
    );
    if (inPlayers.length > 0) {
      console.log(`  In: ${inPlayers.join(", ")}`);
    }
    if (outPlayers.length > 0) {
      console.log(`  Out: ${outPlayers.join(", ")}`);
    }
  }

  // Write output
  writeFileSync(OUTPUT_FILE, JSON.stringify(games, null, 2));
  console.log(`\nSaved ${games.length} parsed games to ${OUTPUT_FILE}`);
}

main();
