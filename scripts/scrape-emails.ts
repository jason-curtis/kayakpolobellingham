import { writeFileSync, readFileSync, existsSync } from "fs";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isGameTopic } from "../lib/email-parser";

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

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = "https://groups.io/g/kayakpolobellingham";
const TOPICS_PER_PAGE = 20;
const RATE_LIMIT_MS = 500;
const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const DATA_FILE = resolve(SCRIPT_DIR, "data/emails.json");

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(html: string): string {
  // Replace <br>, <br/>, <p>, </p>, </div> with newlines
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<div[^>]*>/gi, "");
  // Remove all remaining tags
  text = text.replace(/<[^>]*>/g, "");
  // Decode entities
  text = decodeHtmlEntities(text);
  // Collapse multiple newlines, trim
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Convert groups.io nanosecond timestamp to ISO string */
function groupsIoTimestampToISO(nanos: string): string {
  const ms = Number(BigInt(nanos) / BigInt(1_000_000));
  const d = new Date(ms);
  // Return ISO string without milliseconds and without Z (local-ish)
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; kayakpolo-scraper/1.0; +mailto:thatneat@gmail.com)",
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching ${url}`);
  }
  return resp.text();
}

// isGameTopic imported from lib/email-parser.ts (shared with email worker)

// ── Scrape topic list ──────────────────────────────────────────────────────

interface TopicInfo {
  topicId: string;
  title: string;
  url: string;
}

async function scrapeTopicListPage(page: number): Promise<TopicInfo[]> {
  const url = `${BASE_URL}/topics?page=${page}`;
  console.log(`  Fetching topic list page ${page}: ${url}`);
  const html = await fetchPage(url);

  const topics: TopicInfo[] = [];
  // Pattern: <a class="showvisited subject" href="...topic/slug/ID">Title</a>
  const re =
    /<a\s+class="showvisited subject"\s+href="(https:\/\/groups\.io\/g\/kayakpolobellingham\/topic\/[^"]+\/(\d+))"\s*>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    topics.push({
      url: m[1],
      topicId: m[2],
      title: decodeHtmlEntities(m[3].trim()),
    });
  }
  return topics;
}

async function scrapeAllTopics(existingIds: Set<string>, incremental: boolean): Promise<TopicInfo[]> {
  // First page to get total count
  const firstPageHtml = await fetchPage(`${BASE_URL}/topics?page=1`);
  const countMatch = firstPageHtml.match(/\d+\s*-\s*\d+\s*of\s*(\d+)/);
  const totalTopics = countMatch ? parseInt(countMatch[1], 10) : 3859;
  const totalPages = Math.ceil(totalTopics / TOPICS_PER_PAGE);
  console.log(`Total topics: ${totalTopics}, pages: ${totalPages}`);
  if (incremental) {
    console.log(`  Incremental mode: will stop when all topics on a page are known`);
  }

  // Parse first page
  const allTopics: TopicInfo[] = [];
  const re =
    /<a\s+class="showvisited subject"\s+href="(https:\/\/groups\.io\/g\/kayakpolobellingham\/topic\/[^"]+\/(\d+))"\s*>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(firstPageHtml)) !== null) {
    allTopics.push({
      url: m[1],
      topicId: m[2],
      title: decodeHtmlEntities(m[3].trim()),
    });
  }
  console.log(`  Page 1: found ${allTopics.length} topics`);

  // In incremental mode, stop if all topics on this page are already known
  if (incremental && allTopics.length > 0 && allTopics.every(t => existingIds.has(t.topicId))) {
    console.log(`  All topics on page 1 already known, stopping (incremental mode)`);
    return allTopics;
  }

  // Remaining pages
  for (let page = 2; page <= totalPages; page++) {
    await sleep(RATE_LIMIT_MS);
    const topics = await scrapeTopicListPage(page);
    console.log(`  Page ${page}: found ${topics.length} topics`);
    allTopics.push(...topics);
    if (topics.length === 0) {
      console.log(`  Empty page ${page}, stopping topic list scrape`);
      break;
    }
    // In incremental mode, stop when we hit a page where everything is known
    if (incremental && topics.every(t => existingIds.has(t.topicId))) {
      console.log(`  All topics on page ${page} already known, stopping (incremental mode)`);
      break;
    }
  }

  return allTopics;
}

// ── Scrape individual topic ────────────────────────────────────────────────

const MAX_PAGES = 50;

async function scrapeTopic(info: TopicInfo): Promise<Topic> {
  const topic: Topic = {
    topicId: info.topicId,
    title: info.title,
    url: info.url,
    messages: [],
  };

  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 50; // safety limit to prevent infinite loops

  while (hasMore && page <= MAX_PAGES) {
    const url =
      page === 1 ? info.url : `${info.url}?page=${page}`;
    const html = await fetchPage(url);

    // Extract messages from expanded-message blocks
    // Each message has:
    //   1. Sender name in <u>Name</u> inside the dropdown
    //   2. Timestamp in DisplayShortTime(nanoseconds, ...)
    //   3. Body in <div id="msgbodyNNNN" class="user-content">...</div>

    // Split by expanded-message markers
    const messageDivs = html.split("expanded-message");
    // First chunk is before any message, skip it
    for (let i = 1; i < messageDivs.length; i++) {
      const chunk = messageDivs[i];

      // Extract sender: <u>Name</u> in the dropdown toggle area
      const senderMatch = chunk.match(/<u>([^<]+)<\/u>/);
      const sender = senderMatch
        ? decodeHtmlEntities(senderMatch[1].trim())
        : "Unknown";

      // Extract timestamp: DisplayShortTime(NNNNN, false
      const timeMatch = chunk.match(
        /DisplayShortTime\((\d+),\s*false/
      );
      let date = "";
      if (timeMatch) {
        try {
          date = groupsIoTimestampToISO(timeMatch[1]);
        } catch {
          date = "";
        }
      }

      // Extract body: <div id="msgbodyNNNNN" class="user-content">CONTENT</div>
      // The body ends before the like-stats or the next expanded-message
      const bodyMatch = chunk.match(
        /id="msgbody\d+"\s+class="user-content">([\s\S]*?)(?:<a\s+class="label hashtag-label-sage"|<\/div>\s*<p><\/p>\s*(?:<div class="table-highlight|$))/
      );

      let body = "";
      if (bodyMatch) {
        // The body content is inside the user-content div
        // Extract just the first forcebreak div (the actual message, not quoted text)
        const forcebreakMatch = bodyMatch[1].match(
          /<div\s+class="forcebreak"[^>]*>([\s\S]*?)<\/div>/
        );
        if (forcebreakMatch) {
          body = stripHtml(forcebreakMatch[1]);
        } else {
          body = stripHtml(bodyMatch[1]);
        }
      } else {
        // Fallback: try to get content from msgbody div more broadly
        const fallbackMatch = chunk.match(
          /id="msgbody\d+"\s+class="user-content">([\s\S]*?)<\/div>\s*(?:<a|<p>)/
        );
        if (fallbackMatch) {
          body = stripHtml(fallbackMatch[1]);
        }
      }

      if (sender !== "Unknown" || body) {
        topic.messages.push({ sender, date, body });
      }
    }

    // Check for message pagination within this topic
    const paginationMatch = html.match(
      /(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/
    );
    if (paginationMatch) {
      const end = parseInt(paginationMatch[2], 10);
      const total = parseInt(paginationMatch[3], 10);
      if (end < total) {
        page++;
        await sleep(RATE_LIMIT_MS);
      } else {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return topic;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Kayak Polo Bellingham Email Scraper ===\n");

  // Load existing data for resume support
  let existing: Topic[] = [];
  const existingIds = new Set<string>();
  if (existsSync(DATA_FILE)) {
    try {
      existing = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      for (const t of existing) {
        existingIds.add(t.topicId);
      }
      console.log(
        `Loaded ${existing.length} existing topics from ${DATA_FILE}`
      );
    } catch (e) {
      console.log(`Could not parse existing data file, starting fresh`);
    }
  }

  // Step 1: Scrape topic list pages (incremental if we have existing data)
  const incremental = existingIds.size > 0;
  console.log("\n--- Step 1: Scraping topic list ---\n");
  const allTopics = await scrapeAllTopics(existingIds, incremental);
  console.log(`\nTotal topics found: ${allTopics.length}`);

  // Step 2: Filter to game-related topics
  const gameTopics = allTopics.filter((t) => isGameTopic(t.title));
  console.log(`Game-related topics: ${gameTopics.length}`);

  // Step 3: Filter out already-downloaded topics
  const toDownload = gameTopics.filter(
    (t) => !existingIds.has(t.topicId)
  );
  console.log(`Topics to download: ${toDownload.length}`);
  console.log(
    `Already downloaded: ${gameTopics.length - toDownload.length}`
  );

  // Step 4: Scrape each game topic
  console.log("\n--- Step 2: Scraping game topics ---\n");
  const results: Topic[] = [...existing];
  let downloaded = 0;

  for (const info of toDownload) {
    downloaded++;
    console.log(
      `[${downloaded}/${toDownload.length}] ${info.title} (${info.topicId})`
    );

    try {
      await sleep(RATE_LIMIT_MS);
      const topic = await scrapeTopic(info);
      results.push(topic);
      console.log(`  -> ${topic.messages.length} messages`);

      // Save incrementally every 10 topics
      if (downloaded % 10 === 0) {
        saveResults(results);
        console.log(`  [saved ${results.length} topics to disk]`);
      }
    } catch (err) {
      console.error(`  ERROR scraping ${info.url}: ${err}`);
      // Continue with next topic
    }
  }

  // Final save
  saveResults(results);
  console.log(`\nDone! Saved ${results.length} topics to ${DATA_FILE}`);
}

function saveResults(topics: Topic[]) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(topics, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
