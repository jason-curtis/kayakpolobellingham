/**
 * Game-on notification: sends email to groups.io when a game reaches 6 signups.
 * Only sends once per game (tracks via game_on_notified column).
 */
import { fetchConditionsText } from "./conditions-text";
import { logger } from "./logger";

const GAME_ON_THRESHOLD = 6;
const SITE_URL = "https://kayakpolobellingham.com";
const GROUP_EMAIL = "kayakpolobellingham@groups.io";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1 = any;

export interface GameInfo {
  id: string;
  date: string;
  time: string;
  game_on_notified: number;
}

export interface SignupList {
  in: { name: string }[];
  out: { name: string }[];
  maybe: { name: string }[];
}

export interface SendEmailFn {
  (to: string, subject: string, body: string): Promise<void>;
}

/** Format day of week from date string. */
function dayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Format DD/MM from date string. */
function ddMm(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d)}/${parseInt(m)}`;
}

/** Build the game-on email subject. */
export function buildSubject(date: string): string {
  return `${dayOfWeek(date)} ${ddMm(date)} game on!`;
}

/** Build the conditions report email subject. */
export function buildConditionsSubject(date: string): string {
  return `${dayOfWeek(date)} ${ddMm(date)} game conditions report`;
}

/** Build the email body. */
export function buildBody(
  game: GameInfo,
  signups: SignupList,
  conditions: string,
): string {
  const lines: string[] = [];

  lines.push(`${dayOfWeek(game.date)} ${ddMm(game.date)} — Game on!`);
  lines.push("");

  // Who's in
  if (signups.in.length > 0) {
    lines.push("IN:");
    for (const p of signups.in) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Who's maybe
  if (signups.maybe.length > 0) {
    lines.push("MAYBE:");
    for (const p of signups.maybe) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Who's out
  if (signups.out.length > 0) {
    lines.push("OUT:");
    for (const p of signups.out) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Conditions
  lines.push("CONDITIONS:");
  for (const line of conditions.split("\n")) lines.push(`  ${line}`);
  lines.push("");

  // Permalink
  lines.push(`${SITE_URL}/games/${game.id}`);
  lines.push("");
  lines.push("---");
  lines.push("This is an automated message sent when the 6th player signed up.");

  return lines.join("\n");
}

/** Build the conditions report email body. */
export function buildConditionsBody(
  game: GameInfo,
  signups: SignupList,
  conditions: string,
): string {
  const lines: string[] = [];

  lines.push(`${dayOfWeek(game.date)} ${ddMm(game.date)} — Game conditions report`);
  lines.push("");

  // Conditions first for this report type
  lines.push("CONDITIONS:");
  for (const line of conditions.split("\n")) lines.push(`  ${line}`);
  lines.push("");

  // Who's in
  if (signups.in.length > 0) {
    lines.push("IN:");
    for (const p of signups.in) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Who's maybe
  if (signups.maybe.length > 0) {
    lines.push("MAYBE:");
    for (const p of signups.maybe) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Who's out
  if (signups.out.length > 0) {
    lines.push("OUT:");
    for (const p of signups.out) lines.push(`  ${p.name}`);
    lines.push("");
  }

  // Permalink
  lines.push(`${SITE_URL}/games/${game.id}`);

  return lines.join("\n");
}

/** Check if game just crossed the threshold and send notification if so. */
export async function checkAndNotify(
  db: D1,
  gameId: string,
  sendEmail: SendEmailFn,
): Promise<{ sent: boolean; reason?: string }> {
  // Get game info
  const game = await db
    .prepare("SELECT id, date, time, game_on_notified FROM games WHERE id = ?")
    .bind(gameId)
    .first() as GameInfo | null;

  if (!game) return { sent: false, reason: "game_not_found" };
  if (game.game_on_notified) return { sent: false, reason: "already_notified" };

  // Count "in" signups
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM signups WHERE game_id = ? AND status = 'in'")
    .bind(gameId)
    .first() as { count: number } | null;

  const inCount = row?.count ?? 0;
  if (inCount < GAME_ON_THRESHOLD) {
    return { sent: false, reason: "below_threshold" };
  }

  // Get full signup list for the email
  const { results: signupRows } = await db
    .prepare("SELECT player_name, status FROM signups WHERE game_id = ? ORDER BY created_at ASC")
    .bind(gameId)
    .all() as { results: { player_name: string; status: string }[] };

  const signups: SignupList = {
    in: signupRows.filter(s => s.status === "in").map(s => ({ name: s.player_name })),
    out: signupRows.filter(s => s.status === "out").map(s => ({ name: s.player_name })),
    maybe: signupRows.filter(s => s.status === "maybe").map(s => ({ name: s.player_name })),
  };

  // Fetch conditions
  let conditions: string;
  try {
    conditions = await fetchConditionsText(game.date, game.time);
  } catch (err) {
    logger.warn({ event: "conditions_fetch_error", error: String(err) }, "failed to fetch conditions for notification");
    conditions = "Conditions unavailable";
  }

  // Compose email
  const subject = buildSubject(game.date);
  const body = buildBody(game, signups, conditions);

  // Send
  try {
    await sendEmail(GROUP_EMAIL, subject, body);
  } catch (err) {
    logger.error(
      { event: "game_on_send_error", gameId, error: String(err) },
      "failed to send game-on notification",
    );
    return { sent: false, reason: "send_failed" };
  }

  // Mark as notified
  await db
    .prepare("UPDATE games SET game_on_notified = 1, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), gameId)
    .run();

  logger.info(
    { event: "game_on_notified", gameId, date: game.date, inCount },
    "game-on notification sent",
  );

  return { sent: true };
}
