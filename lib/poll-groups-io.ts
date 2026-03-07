/**
 * Poll groups.io API for new messages, parse signups, and apply to D1.
 * Used as hourly reconciliation to catch anything the email pipeline misses.
 */
import { fetchRecentMessages, decodeSnippet, messageUrl, type GroupsIoMessage } from "./groups-io-api";
import { isGameTopic, extractGameDate, parseSignupsFromMessage, resolveName, resolveSender } from "./email-parser";
import { applyInboundEmail } from "./apply-inbound-email";
import { llmExtractDate } from "./openrouter";
import { logger } from "./logger";

const GROUP_ID = 14099;
const POLL_CURSOR_ID = "poll";
const FETCH_LIMIT = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1 = any;

interface PollCursor {
  last_message_id: number;
}

async function getCursor(db: D1): Promise<number> {
  const row = await db
    .prepare("SELECT last_message_id FROM scrape_cursor WHERE id = ?")
    .bind(POLL_CURSOR_ID)
    .first() as PollCursor | null;
  return row?.last_message_id ?? 0;
}

async function setCursor(db: D1, msgNum: number): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO scrape_cursor (id, last_message_id, games_json) VALUES (?, ?, '{}')")
    .bind(POLL_CURSOR_ID, msgNum)
    .run();
}

export interface PollResult {
  messagesChecked: number;
  newMessages: number;
  signupsApplied: number;
  gamesAffected: string[];
  lastMsgNum: number;
}

/** Poll groups.io for new messages and apply any signups to D1. */
export async function pollForNewMessages(
  db: D1,
  apiKey: string,
  openrouterKey?: string,
): Promise<PollResult> {
  const cursor = await getCursor(db);
  const messages = await fetchRecentMessages(apiKey, GROUP_ID, FETCH_LIMIT);

  // Filter to messages newer than cursor, process oldest-first
  const newMessages = messages
    .filter((m) => m.msg_num > cursor)
    .sort((a, b) => a.msg_num - b.msg_num);

  if (newMessages.length === 0) {
    logger.info({ event: "poll_no_new", cursor }, "no new messages");
    // If first run (cursor=0), set cursor to latest msg_num so we don't re-poll everything
    if (cursor === 0 && messages.length > 0) {
      const maxNum = Math.max(...messages.map((m) => m.msg_num));
      await setCursor(db, maxNum);
      logger.info({ event: "poll_cursor_init", msgNum: maxNum }, "initialized poll cursor");
    }
    return { messagesChecked: messages.length, newMessages: 0, signupsApplied: 0, gamesAffected: [], lastMsgNum: cursor };
  }

  let totalSignups = 0;
  const gamesAffected: string[] = [];

  for (const msg of newMessages) {
    const subject = msg.subject;

    if (!isGameTopic(subject)) {
      logger.info(
        { event: "poll_skip", msgNum: msg.msg_num, subject, name: msg.name },
        "skipping non-game message"
      );
      continue;
    }

    const snippet = decodeSnippet(msg.snippet);
    const senderName = resolveSender(msg.name);
    const signups = parseSignupsFromMessage(snippet, senderName, { resolveName, resolveSender });
    let gameDate = extractGameDate(subject, msg.created);

    // LLM fallback for date extraction when regex fails
    if (!gameDate && openrouterKey) {
      gameDate = await llmExtractDate(openrouterKey, subject, snippet);
      if (gameDate) {
        logger.info(
          { event: "poll_llm_date", msgNum: msg.msg_num, subject, llmDate: gameDate },
          "LLM extracted date after regex failed"
        );
      }
    }

    logger.info(
      {
        event: "poll_parsed",
        msgNum: msg.msg_num,
        subject,
        sender: msg.name,
        resolvedSender: senderName,
        gameDate,
        signupCount: signups.length,
        signups,
        snippet,
      },
      "parsed groups.io message"
    );

    if (signups.length === 0 || !gameDate) continue;

    const result = await applyInboundEmail(db, {
      senderName,
      signups,
      gameDate,
      isGameTopic: true,
      rawBody: snippet,
    }, messageUrl(msg.msg_num), msg.created);

    totalSignups += result.signupsApplied;
    if (result.gameId && !gamesAffected.includes(result.gameId)) {
      gamesAffected.push(result.gameId);
    }
  }

  const maxNum = Math.max(...newMessages.map((m) => m.msg_num));
  await setCursor(db, maxNum);

  logger.info(
    {
      event: "poll_complete",
      newMessages: newMessages.length,
      signupsApplied: totalSignups,
      gamesAffected,
      lastMsgNum: maxNum,
    },
    "poll cycle complete"
  );

  return {
    messagesChecked: messages.length,
    newMessages: newMessages.length,
    signupsApplied: totalSignups,
    gamesAffected,
    lastMsgNum: maxNum,
  };
}
