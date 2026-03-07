/**
 * Single place for parsing email content: signups, dates, game topics.
 * Used by: worker (single inbound email), batch script (scraped topics → parsed games).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type SignupStatus = "in" | "out" | "maybe";

export interface Signup {
  name: string;
  status: SignupStatus;
}

export interface EmailParseResult {
  senderName: string;
  signups: Signup[];
  gameDate: string | null;
  isGameTopic: boolean;
  rawBody: string;
}

/** Scraped topic shape (scripts/parse-signups, scrape-emails). */
export interface TopicMessage {
  sender: string;
  date: string;
  body: string;
}

export interface Topic {
  topicId: string;
  title: string;
  url: string;
  messages: TopicMessage[];
}

export interface ParsedGame {
  date: string;
  dayOfWeek: string;
  time: string;
  gameOn: boolean;
  noGame: boolean;
  players: Signup[];
  topicIds: string[];
  topicTitles: string[];
}

/** Optional name/sender resolvers for batch parsing (static aliases). Real-time uses D1 in apply layer. */
export interface SignupParseOptions {
  resolveName?: (name: string) => string;
  resolveSender?: (sender: string) => string;
}

// ── Name aliasing (batch / static fallback) ─────────────────────────────────

export const NAME_ALIASES: Record<string, string> = {
  dor: "Dorothy", db: "Dorothy", "dorothy burke": "Dorothy", dorothy: "Dorothy",
  gary: "Gary", gs: "Gary", g: "Gary", gsouthstone: "Gary",
  glenno: "Glenn", glen: "Glenn", glenn: "Glenn", "glenn biernacki": "Glenn",
  dave: "Dave", dberger007: "Dave", jason: "Jason", bubbles: "Jason", "jason curtis": "Jason",
  paul: "Paul", "paul burkhouse": "Paul", genaro: "Genaro", "genaro shaffer": "Genaro",
  cam: "Cameron", cameron: "Cameron", "cameron berg": "Cameron", buddy: "Buddy", "buddy bomze": "Buddy",
  mark: "Mark", "mark lisowski": "Mark", aaron: "Aaron", "aaron dutton": "Aaron",
  mike: "Mike", "mike mills": "Mike", melissa: "Melissa", "melissa bertocchini": "Melissa",
  sarah: "Sarah", "sarah hare": "Sarah", kevin: "Kevin", ryan: "Ryan", "ryan vasak": "Ryan",
  jer: "Jerimiah", jerimiah: "Jerimiah", "jerimiah welch": "Jerimiah", jerimiahwelch: "Jerimiah",
  matt: "Matt", "matt goodwin": "Matt", liz: "Liz", "liz donovan": "Liz",
  daddy: "Gary", "needle nose": "Glenn", grumpy: "Dave", gimpy: "Dave", grump: "Dave", "other grump": "Dave",
  dorth: "Dorothy", dorthvader: "Dorothy", "d and g": "Dorothy", "a-aron": "Aaron",
  mel: "Melissa", mellissa: "Melissa", maryanne: "Maryann", kev: "Kevin", "kevin murphy": "Kevin",
  nick: "Nick", dane: "Dane", genero: "Genaro", tim: "Tim", sheila: "Sheila", christine: "Christine",
  chloe: "Chloe", jimmy: "Jimmy", steve: "Steve", "sgibson.home": "Steve", conor: "Conor",
  "cari lou": "Cari", cari: "Cari", "maryann schmitt": "Maryann", maryann: "Maryann",
  "adam bierschenk": "Adam", adam: "Adam", gib: "Gib", "gib morrow": "Gib",
  "james mcardle": "James", james: "James", "ben": "Ben",
};

export const SENDER_MAP: Record<string, string> = {
  "Dorothy Burke": "Dorothy", gsouthstone: "Gary", "glenn biernacki": "Glenn", dberger007: "Dave",
  "Jason Curtis": "Jason", "Paul Burkhouse": "Paul", "Genaro Shaffer": "Genaro", "Cameron Berg": "Cameron",
  "Buddy Bomze": "Buddy", "Mark Lisowski": "Mark", "Aaron Dutton": "Aaron", "Mike Mills": "Mike",
  "Melissa Bertocchini": "Melissa", "Sarah Hare": "Sarah", Kevin: "Kevin", "Ryan Vasak": "Ryan",
  jerimiahwelch: "Jerimiah", "Jerimiah Welch": "Jerimiah", "Matt Goodwin": "Matt", "Liz Donovan": "Liz",
  "Gib Morrow": "Gib", "Cari Lou": "Cari", "Maryann Schmitt": "Maryann", "adam bierschenk": "Adam",
  "James McArdle": "James", "sgibson.home": "Steve", bflannelly50: "Brian",
};

export function resolveName(name: string): string {
  let trimmed = name.trim().replace(/'s$/i, "");
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (NAME_ALIASES[lower]) return NAME_ALIASES[lower];
  if (SENDER_MAP[trimmed]) return SENDER_MAP[trimmed];
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function resolveSender(sender: string): string {
  return SENDER_MAP[sender] ?? resolveName(sender);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const STOP_WORDS = new Set([
  "the", "is", "in", "out", "on", "at", "for", "we", "will", "be", "there", "plus",
  "arriving", "from", "to", "joined", "by", "who", "whoever", "else", "also", "too", "as", "an", "a", "of",
  "he", "she", "his", "her", "our", "with", "but", "not", "no", "game", "new", "keep", "posting", "still",
  "well", "if", "so", "ignore", "says", "playing", "their", "about", "posted", "sign", "this", "that",
  "very", "most", "just", "please", "post", "could", "leave", "yours", "which", "hopefully", "or", "see",
  "working", "thanks", "start", "slide", "btw", "change", "sounds", "like", "although", "it", "especially",
  "back", "counting", "depending", "etc", "considering", "teammates", "dress", "same", "last", "amounts",
  "give", "know", "march", "other", "while", "basking", "oh", "ok", "im", "um",
]);

const BAD_NAMES = new Set([
  "I'm", "Im", "If", "So", "Me", "We", "You", "Also", "Please", "Post", "Start", "Change", "Working",
  "Hopefully", "Considering", "Depending", "Etc", "Teammates", "Dress", "Although", "Especially",
  "Counting", "Amounts", "Give", "Know", "March", "Other", "While", "Basking", "Oh", "Ok", "Posted", "Sign",
  "Correctamundo", "Mittens", "Newbies-", "Um", "Aar-in", "Cam-a", "Gibbous", "Pb", "Gb", "Idave", "Rv",
  "Mab", "Dv", "Paulk", "Gar", "Oc", "Slide", "Btw", "Last", "Same", "Back", "Just", "Skirt", "Off", "Helmet",
  "Hannah", "Have", "Could", "Leave", "Yours", "Which", "Jerianne", "G-", "G-gear", "G-in", "Still", "Can",
  "I'll", "We're", "Say", "Support", "Sorry", "Er", "Arrived", "Go", "Makes", "Anyone", "Probably", "Family",
  "Myself", "Remember", "Il", "Did", "Some", "Let", "Paddle", "Meet", "Come", "Get", "Welches", "Stubby",
  "Chad", "Due", "Finagle", "Hangovers", "Feel", "Lane", "Robert",
]);

export function isBadName(name: string): boolean {
  return BAD_NAMES.has(name);
}

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

// ── Sender / body (single email) ────────────────────────────────────────────

export function extractSenderName(from: string): string {
  const quoted = from.match(/^"([^"]+)"\s*<[^>]+>$/);
  if (quoted) return quoted[1].trim();
  const unquoted = from.match(/^([^<]+)<[^>]+>$/);
  if (unquoted) return unquoted[1].trim();
  const i = from.indexOf("@");
  if (i > 0) return from.slice(0, i).trim();
  return from.trim();
}

export function stripQuotedText(body: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i.test(line)) break;
    if (/^On .+ wrote:\s*$/.test(line)) break;
    if (/^--\s*$/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    if (/^(from|sent|to|subject|date):/i.test(line.trim())) continue;
    kept.push(line);
  }

  // Second pass: catch multi-line "On <date> ... wrote:" (Gmail wraps long sender names)
  const joined = kept.join("\n");
  const multiLineQuote = joined.search(/^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.+\d{4}/m);
  if (multiLineQuote !== -1) {
    return joined.slice(0, multiLineQuote).trimEnd();
  }
  return joined;
}

// ── Signup line parsing ─────────────────────────────────────────────────────

export function parseSignupsFromMessage(
  body: string,
  sender: string,
  options?: SignupParseOptions
): Signup[] {
  const resolveN = options?.resolveName ?? ((n: string) => titleCase(n));
  const resolveS = options?.resolveSender ?? ((s: string) => s);
  const resolvedSender = resolveS(sender);
  const results: Signup[] = [];
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    let lower = line.toLowerCase();
    if (lower.startsWith("from:") || lower.startsWith("sent:") || lower.startsWith(">")) continue;
    if (lower.includes("yahoo mail") || lower.includes("mailto:")) continue;
    lower = lower.replace(/^[.\-–—*•·,;:!?]+\s*/, "").replace(/^(actually|sorry|wait|update|change|nvm|nevermind)[,:]?\s*/i, "");

    if (/\bi'?m\s+in\b/.test(lower) || /\bi'?ll\s+play\b/.test(lower) || /\bi'?ll\s+be\s+there\b/.test(lower) || /\bcount\s+me\s+in\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "in" });
      continue;
    }
    if (/\bi'?m\s+out\b/.test(lower) || /\bi'?m\s+a?\s*no\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "out" });
      continue;
    }
    // Explicit self-referencing maybe patterns (before name-based patterns)
    if (/\bi'?m\s+a\s+maybe\b/.test(lower) || /\bi\s+might\b/.test(lower) || /\btentative\b/.test(lower) || /\bunsure\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "maybe" });
      continue;
    }

    const andPattern = lower.match(/^([a-z][a-z'\-]{1,15})\s+and\s+([a-z][a-z'\-]{1,15})\s+(?:are\s+)?(in|out|maybe)\b/);
    if (andPattern) {
      const n1 = resolveN(andPattern[1]);
      const n2 = resolveN(andPattern[2]);
      const st = andPattern[3] as SignupStatus;
      if (n1 && !isStopWord(n1.toLowerCase())) results.push({ name: n1, status: st });
      if (n2 && !isStopWord(n2.toLowerCase())) results.push({ name: n2, status: st });
      continue;
    }

    const nameInOut = lower.match(/^([a-z][a-z'\-]{1,15})\s+(in|out|maybe)\b/);
    if (nameInOut) {
      const name = resolveN(nameInOut[1]);
      if (name.length >= 2 && !isStopWord(name.toLowerCase())) {
        results.push({ name, status: nameInOut[2] as SignupStatus });
        continue;
      }
    }

    const possessiveIn = lower.match(/^([a-z][a-z'\-]{1,15})(?:'s)\s+(in|out|maybe)\b/);
    if (possessiveIn) {
      const name = resolveN(possessiveIn[1]);
      if (name.length >= 2 && !isStopWord(name.toLowerCase())) {
        results.push({ name, status: possessiveIn[2] as SignupStatus });
        continue;
      }
    }

    if (/^g[\- ]in\b/.test(lower)) {
      results.push({ name: "Gary", status: "in" });
      continue;
    }
    if (/^in[!.]?\s*$/.test(lower) || /^yes[!.]?\s*$/.test(lower) || /^yep[!.]?\s*$/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "in" });
      continue;
    }
    if (/^out[!.]?\s*$/.test(lower) || /^no[!.]?\s*$/.test(lower) || /^nay[!.]?\s*$/.test(lower) || /^can'?t make it/i.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "out" });
      continue;
    }
    // Standalone "maybe" / "depends" — must come after name-based patterns
    if (/^maybe[!.]?\s*$/.test(lower) || /\bdepends\b/.test(lower)) {
      if (resolvedSender) results.push({ name: resolvedSender, status: "maybe" });
      continue;
    }
  }
  return results;
}

// ── Date parsing ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Day-of-week aliases for ordinal matching. */
const DAY_ALIASES: Record<string, string> = {
  sun: "sunday", mon: "monday", tue: "tuesday", tues: "tuesday",
  wed: "wednesday", weds: "wednesday", wedd: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday",
  fri: "friday", sat: "saturday",
};

/**
 * Parse game date from subject (single email).
 * referenceDate: ISO string of the message timestamp (e.g. "2009-02-25T...").
 * Used for year fallback and past-date correction.
 */
export function extractGameDate(subject: string, referenceDate?: string): string | null {
  const t = subject.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ");
  const refDate = referenceDate ? new Date(referenceDate) : null;
  const fallbackYear = refDate ? refDate.getFullYear() : new Date().getFullYear();

  let result: string | null = null;

  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    result = formatDate(year, parseInt(m[1]), parseInt(m[2]));
  }
  if (!result) {
    m = t.match(/(\d{1,2})\/(\d{1,2})(?!\d)/);
    if (m) {
      const month = parseInt(m[1]);
      const day = parseInt(m[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        result = formatDate(fallbackYear, month, day);
      }
    }
  }
  if (!result) {
    const monthNames = Object.keys(MONTHS).join("|");
    const re = new RegExp(`(${monthNames})\\w*\\s+(\\d{1,2})\\s*(?:,?\\s*(\\d{4}))?`);
    m = t.match(re);
    if (m) {
      const month = MONTHS[m[1].toLowerCase()];
      const day = parseInt(m[2]);
      const year = m[3] ? parseInt(m[3]) : fallbackYear;
      if (month && day >= 1 && day <= 31) result = formatDate(year, month, day);
    }
  }

  // Day name + ordinal: "Wednesday the 11th", "next Sunday the 5th"
  if (!result) {
    const allDayNames = [...DAY_NAMES, ...Object.keys(DAY_ALIASES)].join("|");
    const ordRe = new RegExp(`(?:next|this)?\\s*(?:${allDayNames})\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)`);
    m = t.match(ordRe);
    if (m) {
      const day = parseInt(m[1]);
      if (day >= 1 && day <= 31) {
        const ref = refDate ?? new Date();
        let month = ref.getMonth() + 1; // 1-indexed
        let year = fallbackYear;
        if (day < ref.getDate()) {
          month++;
          if (month > 12) { month = 1; year++; }
        }
        result = formatDate(year, month, day);
      }
    }
  }

  if (!result || !refDate) return result;

  // Past-date correction: if result is before refDate and subject mentions a day name, advance
  const parsed = new Date(`${result}T12:00:00`);
  const refDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  if (parsed < refDay) {
    const dayName = DAY_NAMES.find((d) => t.includes(d));
    if (dayName) {
      const targetDow = DAY_NAMES.indexOf(dayName);
      const refDow = refDay.getDay();
      let daysAhead = (targetDow - refDow + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      const next = new Date(refDay);
      next.setDate(next.getDate() + daysAhead);
      result = formatDate(next.getFullYear(), next.getMonth() + 1, next.getDate());
    }
  }

  return result;
}

/** Parse game date from topic title (batch); refDate = first message date for year. */
export function parseDateFromTitle(title: string, refDate?: string): string | null {
  const t = title.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ");
  let refYear = new Date().getFullYear();
  if (refDate) {
    const y = parseInt(refDate.substring(0, 4));
    if (!isNaN(y)) refYear = y;
  }

  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    if (year === 2016 && refYear >= 2025) year = 2026;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  m = t.match(/(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m) {
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${refYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const monthNames = Object.keys(MONTHS).join("|");
  const re1 = new RegExp(`(${monthNames})\\w*\\s+(\\d{1,2})\\s*(?:,?\\s*(\\d{4}))?`);
  m = t.match(re1);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = parseInt(m[2]);
    const year = m[3] ? parseInt(m[3]) : refYear;
    if (month && day >= 1 && day <= 31) return formatDate(year, month, day);
  }
  m = t.match(/(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|weds?)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)/);
  if (m && refDate) {
    const day = parseInt(m[1]);
    if (day >= 1 && day <= 31) {
      const refMonth = parseInt(refDate.substring(5, 7));
      const refDay = parseInt(refDate.substring(8, 10));
      let month = refMonth;
      if (day < refDay - 14) month = refMonth + 1;
      let y = refYear;
      if (month > 12) {
        month = 1;
        y++;
      }
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (t.includes("nye")) return `${refYear}-12-31`;
  if (t.includes("easter")) return refYear === 2025 ? "2025-04-20" : refYear === 2024 ? "2024-03-31" : null;
  if (t.includes("memorial day")) return `${refYear}-05-26`;
  if (t.includes("may day")) return `${refYear}-05-01`;
  return null;
}

function formatDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Game On roster ──────────────────────────────────────────────────────────

export function parseRosterFromGameOn(body: string, resolveN: (name: string) => string = resolveName): string[] {
  const text = body.replace(/Game\s*On\s*:?\s*/gi, "").trim();
  const parts = text.split(/[,]|\band\b/).map((p) => p.trim()).filter(Boolean);
  const players: string[] = [];
  for (const part of parts) {
    const nameMatch = part.match(/^([A-Za-z][A-Za-z'\-]{1,15})/);
    if (nameMatch) {
      const name = resolveN(nameMatch[1]);
      if (name && name.length >= 2 && !isStopWord(name.toLowerCase()) && !isBadName(name)) players.push(name);
    }
  }
  return [...new Set(players)];
}

// ── Game topic detection ────────────────────────────────────────────────────

export function isGameTopic(title: string): boolean {
  const t = title.toLowerCase();
  if (t.includes("post in or out") || t.includes("post in/out")) return true;
  if (/\bgame on\b/.test(t) || /\bno game\b/.test(t)) return true;
  if (/\bneed \d+ more\b/.test(t) || /\bone more\b/.test(t) && /\bplayer\b/.test(t)) return true;
  if (/\bone more needed\b/.test(t) || /\bmore needed\b/.test(t)) return true;
  if (/\bgame cancelled\b/.test(t) || /\bgame canceled\b/.test(t)) return true;
  if (/\bseason opener\b/.test(t) || /\bfirst game\b/.test(t) || /\blast game\b/.test(t)) return true;
  const dayPattern = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|weds?|wedd?|thurs?|tues?|sat|sun|mon|fri)\b/;
  const datePattern = /\b(\d{1,2}\/\d{1,2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2})\b/;
  if (dayPattern.test(t) && datePattern.test(t)) return true;
  // Day name + ordinal (e.g., "next Wednesday the 11th")
  if (dayPattern.test(t) && /\b\d{1,2}(?:st|nd|rd|th)\b/.test(t)) return true;
  return false;
}

// ── Single email entry (worker) ──────────────────────────────────────────────

export function parseInboundEmail(email: { from: string; subject: string; textBody: string }): EmailParseResult {
  const senderName = extractSenderName(email.from);
  const cleaned = stripQuotedText(email.textBody);
  return {
    senderName,
    signups: parseSignupsFromMessage(cleaned, senderName),
    gameDate: extractGameDate(email.subject),
    isGameTopic: isGameTopic(email.subject),
    rawBody: cleaned.trim(),
  };
}

// ── Batch: topics → parsed games ─────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function aggregateTopicsIntoGames(topics: Topic[]): ParsedGame[] {
  const gameMap = new Map<string, ParsedGame>();

  for (const topic of topics) {
    const firstMsgDate = topic.messages.length > 0 ? topic.messages[0].date : "";
    const gameDate = parseDateFromTitle(topic.title, firstMsgDate);
    if (!gameDate) continue;

    const titleLower = topic.title.toLowerCase();
    const isWeds = titleLower.includes("weds") || titleLower.includes("wednesday") || titleLower.includes("wedd");
    const time = isWeds ? "18:00" : "09:00";

    if (!gameMap.has(gameDate)) {
      const dateObj = new Date(`${gameDate}T12:00:00`);
      gameMap.set(gameDate, {
        date: gameDate,
        dayOfWeek: DAYS[dateObj.getDay()],
        time,
        gameOn: false,
        noGame: false,
        players: [],
        topicIds: [],
        topicTitles: [],
      });
    }
    const game = gameMap.get(gameDate)!;
    game.topicIds.push(topic.topicId);
    game.topicTitles.push(topic.title);
    if (/game\s*on/i.test(topic.title)) game.gameOn = true;
    if (/no\s*game/i.test(topic.title)) game.noGame = true;

    const isGameOnTopic = /game\s*on/i.test(topic.title);
    const batchOpts: SignupParseOptions = { resolveName, resolveSender };

    for (const msg of topic.messages) {
      if (!msg.body.trim()) continue;
      if (isGameOnTopic && msg === topic.messages[0]) {
        const roster = parseRosterFromGameOn(msg.body);
        if (roster.length >= 3) {
          for (const name of roster) {
            if (!game.players.some((p) => p.name === name)) game.players.push({ name, status: "in" });
          }
          continue;
        }
      }
      const signups = parseSignupsFromMessage(msg.body, msg.sender, batchOpts);
      for (const signup of signups) {
        if (isBadName(signup.name)) continue;
        const existing = game.players.find((p) => p.name === signup.name);
        if (existing) existing.status = signup.status;
        else game.players.push(signup);
      }
    }
  }

  return [...gameMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}
