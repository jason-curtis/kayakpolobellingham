/**
 * Runtime scrape from Groups.io: no fs, fetch /message/{id}, parse JSON-LD, merge into games.
 * Used by POST /api/admin/scrape-from-groups (chunked).
 */

import {
  isGameTopic,
  isBadName,
  parseDateFromTitle,
  parseSignupsFromMessage,
  resolveName,
  resolveSender,
  type Signup,
  type ParsedGame,
} from "./email-parser";

const BASE_URL = "https://groups.io/g/kayakpolobellingham";
export const RATE_LIMIT_MS = 100;

const USER_AGENT = "Mozilla/5.0 (compatible; kayakpolo-scraper/1.0; +mailto:thatneat@gmail.com)";

/** DiscussionForumPosting from groups.io JSON-LD */
export interface DiscussionForumPosting {
  "@type"?: string;
  headline?: string;
  text?: string;
  datePublished?: string;
  author?: { "@type"?: string; name?: string };
  discussionUrl?: string;
  url?: string;
}

/** Extract JSON-LD DiscussionForumPosting from message page HTML */
export function extractJsonLd(html: string): DiscussionForumPosting | null {
  const match = html.match(/<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim()) as DiscussionForumPosting;
    return obj["@type"] === "DiscussionForumPosting" ? obj : null;
  } catch {
    return null;
  }
}

/** Process one message: if game topic, return game date, time, and signups to merge; else null */
export function processMessage(ld: DiscussionForumPosting): { gameDate: string; time: string; signups: Signup[] } | null {
  const headline = ld.headline ?? "";
  if (!isGameTopic(headline)) return null;

  const refDate = ld.datePublished?.slice(0, 10) ?? "";
  const gameDate = parseDateFromTitle(headline, refDate);
  if (!gameDate) return null;

  const titleLower = headline.toLowerCase();
  const isWeds = titleLower.includes("weds") || titleLower.includes("wednesday") || titleLower.includes("wedd");
  const time = isWeds ? "18:00" : "09:00";

  const sender = ld.author?.name ?? "Unknown";
  const text = ld.text ?? "";
  const rawSignups = parseSignupsFromMessage(text, sender, { resolveName, resolveSender });
  const signups = rawSignups.filter((s) => !isBadName(s.name));
  if (signups.length === 0) return null;

  return { gameDate, time, signups };
}

/** Fetch one message page (no delay; caller must rate-limit) */
export async function fetchMessagePage(id: number): Promise<string> {
  const url = `${BASE_URL}/message/${id}`;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/** Games keyed by "date|time" for merging */
export type GamesMap = Map<string, { date: string; time: string; players: Signup[] }>;

/** Merge one message's result into the games map (dedupe by player, later status wins) */
export function mergeIntoGames(
  map: GamesMap,
  key: string,
  gameDate: string,
  time: string,
  signups: Signup[]
): void {
  let entry = map.get(key);
  if (!entry) {
    entry = { date: gameDate, time, players: [] };
    map.set(key, entry);
  }
  for (const s of signups) {
    const existing = entry.players.find((p) => p.name === s.name);
    if (existing) existing.status = s.status;
    else entry.players.push(s);
  }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Convert games map to ParsedGame[] (for DB write) */
export function gamesMapToParsedGames(map: GamesMap): ParsedGame[] {
  const games: ParsedGame[] = [];
  for (const [, g] of map) {
    const dateObj = new Date(`${g.date}T12:00:00`);
    games.push({
      date: g.date,
      dayOfWeek: DAYS[dateObj.getDay()],
      time: g.time,
      gameOn: false,
      noGame: false,
      players: g.players,
      topicIds: [],
      topicTitles: [],
    });
  }
  return games.sort((a, b) => a.date.localeCompare(b.date));
}

/** Sleep helper */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialize games map for D1 storage */
export function serializeGamesMap(map: GamesMap): string {
  const arr = [...map.entries()].map(([key, g]) => ({ key, date: g.date, time: g.time, players: g.players }));
  return JSON.stringify(arr);
}

/** Deserialize games map from D1 storage */
export function deserializeGamesMap(json: string): GamesMap {
  const map: GamesMap = new Map();
  const arr = JSON.parse(json || "[]") as { key: string; date: string; time: string; players: Signup[] }[];
  for (const { key, date, time, players } of arr) {
    map.set(key, { date, time, players });
  }
  return map;
}

/** Max consecutive 404s before concluding we've passed the last message.
 *  Groups.io message IDs are non-contiguous (large gaps exist), so a single
 *  404 does NOT mean we've reached the end. */
const MAX_CONSECUTIVE_404S = 50;

/** Run one chunk: fetch up to maxMessages starting from startId, merge into provided map. Returns last id processed and count of game messages. */
export async function scrapeChunk(
  startId: number,
  maxMessages: number,
  intoMap: GamesMap
): Promise<{ lastMessageId: number; topicsScraped: number; done: boolean }> {
  let topicsScraped = 0;
  let consecutive404s = 0;
  let lastIdAttempted = startId - 1;

  for (let i = 0; i < maxMessages; i++) {
    const id = startId + i;
    lastIdAttempted = id;
    await sleep(RATE_LIMIT_MS);

    let html: string;
    try {
      html = await fetchMessagePage(id);
    } catch (err) {
      // Treat non-404 errors as terminal for this chunk
      return { lastMessageId: lastIdAttempted, topicsScraped, done: false };
    }

    if (html === "") {
      consecutive404s++;
      // Only conclude we've passed the end after many consecutive 404s
      if (consecutive404s >= MAX_CONSECUTIVE_404S) {
        return { lastMessageId: lastIdAttempted, topicsScraped, done: true };
      }
      continue;
    }

    consecutive404s = 0;

    const ld = extractJsonLd(html);
    if (!ld) continue;

    const result = processMessage(ld);
    if (!result) continue;

    topicsScraped++;
    const key = `${result.gameDate}|${result.time}`;
    mergeIntoGames(intoMap, key, result.gameDate, result.time, result.signups);
  }

  return { lastMessageId: lastIdAttempted, topicsScraped, done: false };
}
