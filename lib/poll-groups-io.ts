/**
 * Poll groups.io API for new messages, parse signups, and apply to D1.
 * Uses the unified parseGameMessage() pipeline for consistent parsing
 * with the email worker path (stripQuotedText, body date fallback, LLM fallback).
 */
import { fetchRecentMessages, decodeSnippet, stripHtml, messageUrl, type GroupsIoMessage } from "./groups-io-api";
import { isGameTopic, parseGameMessage } from "./email-parser";
import { applyInboundEmail } from "./apply-inbound-email";
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

/** Extract usable plain-text body from a Groups.io message. */
function getMessageText(msg: GroupsIoMessage): string {
  // Prefer full HTML body (stripped to text) over truncated snippet
  if (msg.body && msg.body.trim()) {
    return stripHtml(msg.body);
  }
  return decodeSnippet(msg.snippet);
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

    const body = getMessageText(msg);

    // Use the unified parseGameMessage() pipeline — same as the email worker path.
    // This applies stripQuotedText(), body date fallback, and LLM fallback.
    const result = await parseGameMessage({
      subject,
      body,
      senderName: msg.name,
      referenceDate: msg.created,
      openrouterKey,
    });

    const sourceUrl = messageUrl(msg.msg_num);

    logger.info(
      {
        event: "poll_parsed",
        msgNum: msg.msg_num,
        subject,
        sender: msg.name,
        resolvedSender: result.senderName,
        gameDate: result.gameDate,
        signupCount: result.signups.length,
        signups: result.signups,
        bodyPreview: body.slice(0, 200),
      },
      "parsed groups.io message"
    );

    if (result.signups.length === 0 || !result.gameDate) continue;

    const applied = await applyInboundEmail(db, result, sourceUrl, msg.created);

    totalSignups += applied.signupsApplied;
    if (applied.gameId && !gamesAffected.includes(applied.gameId)) {
      gamesAffected.push(applied.gameId);
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

/** Delete signups attributed to auto-forwarding addresses (Gmail +caf_= pattern). */
async function cleanupForwardingSignups(db: D1): Promise<number> {
  const result = await db
    .prepare("DELETE FROM signups WHERE player_name LIKE '%+caf_%=%'")
    .run();
  const deleted = result?.changes ?? 0;
  if (deleted > 0) {
    logger.info({ event: "cleanup_forwarding", deleted }, "deleted forwarding address signups");
  }
  return deleted;
}

/** Re-process the last N messages regardless of cursor. Used for backfill after parser fixes. */
export async function backfillRecentMessages(
  db: D1,
  apiKey: string,
  openrouterKey?: string,
  limit = 100,
): Promise<PollResult> {
  // Clean up any existing signups from auto-forwarding addresses before re-processing
  await cleanupForwardingSignups(db);

  const messages = await fetchRecentMessages(apiKey, GROUP_ID, limit);
  // Process oldest-first
  const sorted = messages.sort((a, b) => a.msg_num - b.msg_num);

  let totalSignups = 0;
  const gamesAffected: string[] = [];

  for (const msg of sorted) {
    if (!isGameTopic(msg.subject)) continue;

    const body = getMessageText(msg);
    const result = await parseGameMessage({
      subject: msg.subject,
      body,
      senderName: msg.name,
      referenceDate: msg.created,
      openrouterKey,
    });

    const sourceUrl = messageUrl(msg.msg_num);

    logger.info(
      {
        event: "backfill_parsed",
        msgNum: msg.msg_num,
        subject: msg.subject,
        sender: msg.name,
        resolvedSender: result.senderName,
        gameDate: result.gameDate,
        signupCount: result.signups.length,
        signups: result.signups,
      },
      "backfill parsed message"
    );

    if (result.signups.length === 0 || !result.gameDate) continue;

    const applied = await applyInboundEmail(db, result, sourceUrl, msg.created);

    totalSignups += applied.signupsApplied;
    if (applied.gameId && !gamesAffected.includes(applied.gameId)) {
      gamesAffected.push(applied.gameId);
    }
  }

  // Update cursor to latest message
  if (sorted.length > 0) {
    const maxNum = Math.max(...sorted.map((m) => m.msg_num));
    await setCursor(db, maxNum);
  }

  logger.info(
    {
      event: "backfill_complete",
      messagesProcessed: sorted.length,
      signupsApplied: totalSignups,
      gamesAffected,
    },
    "backfill complete"
  );

  return {
    messagesChecked: messages.length,
    newMessages: sorted.length,
    signupsApplied: totalSignups,
    gamesAffected,
    lastMsgNum: sorted.length > 0 ? Math.max(...sorted.map((m) => m.msg_num)) : 0,
  };
}
