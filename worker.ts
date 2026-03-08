/**
 * Custom worker: wraps OpenNext fetch handler, adds RPC entrypoint for inbound email,
 * and scheduled handler for hourly groups.io API reconciliation.
 * Wrangler main should point here so the email worker can call handleEmail via service binding.
 * Type-check with: pnpm exec tsc -p tsconfig.worker.json
 */
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from "cloudflare:workers";
import { parseGameMessage, extractSenderName } from "./lib/email-parser";
import { applyInboundEmail } from "./lib/apply-inbound-email";
import { pollForNewMessages } from "./lib/poll-groups-io";
import { checkAndNotify } from "./lib/game-on-notify";
import { createGroupsIoSender } from "./lib/send-email";
import { logger } from "./lib/logger";

// Generated at build time by opennextjs-cloudflare
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import nextHandler from "./.open-next/worker.js";

export interface IncomingEmailPayload {
  from: string;
  subject: string;
  textBody: string;
}

interface Env {
  D1_DB: D1Database;
  ASSETS: Fetcher;
  GROUPS_IO_API_KEY: string;
  OPENROUTER_API_KEY: string;
}

export default class KayakPoloWorker extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    return (nextHandler as { fetch: (req: Request, e: Env, c: ExecutionContext) => Promise<Response> }).fetch(
      request,
      this.env,
      this.ctx
    );
  }

  /** Hourly reconciliation: poll groups.io API to catch messages the email pipeline missed. */
  async scheduled(_event: ScheduledEvent): Promise<void> {
    const apiKey = this.env.GROUPS_IO_API_KEY;
    if (!apiKey) {
      logger.error({ event: "poll_no_key" }, "GROUPS_IO_API_KEY not set");
      return;
    }
    try {
      logger.info({ event: "reconciliation_start" }, "hourly reconciliation sweep starting");
      const sendEmail = createGroupsIoSender(apiKey);
      const result = await pollForNewMessages(this.env.D1_DB, apiKey, this.env.OPENROUTER_API_KEY, sendEmail);
      logger.info({ event: "reconciliation_complete", ...result }, "hourly reconciliation sweep complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: "reconciliation_error", error: message }, "hourly reconciliation failed");
    }
  }

  async handleEmail(payload: IncomingEmailPayload): Promise<{ ok: boolean; gameId?: string; signupsApplied?: number; error?: string }> {
    try {
      const result = await parseGameMessage({
        subject: payload.subject,
        body: payload.textBody ?? "",
        senderName: extractSenderName(payload.from),
        openrouterKey: this.env.OPENROUTER_API_KEY,
      });

      logger.info(
        {
          event: "email_parsed",
          from: payload.from,
          subject: payload.subject,
          senderName: result.senderName,
          gameDate: result.gameDate ?? undefined,
          isGameTopic: result.isGameTopic,
          signupCount: result.signups.length,
          signups: result.signups,
          applied: result.isGameTopic && result.signups.length > 0,
        },
        "inbound email parsed"
      );

      if (!result.isGameTopic || result.signups.length === 0) {
        return { ok: true, signupsApplied: 0 };
      }

      const db = this.env.D1_DB;
      const { gameId, signupsApplied } = await applyInboundEmail(db, result);
      logger.info(
        { event: "email_applied", gameId: gameId ?? undefined, signupsApplied },
        "parsed signups applied to D1"
      );

      // Check if this signup triggered game-on threshold
      if (gameId && this.env.GROUPS_IO_API_KEY) {
        try {
          const sendEmail = createGroupsIoSender(this.env.GROUPS_IO_API_KEY);
          await checkAndNotify(db, gameId, sendEmail);
        } catch (err) {
          logger.warn(
            { event: "game_on_check_error", gameId, error: String(err) },
            "game-on notification check failed (non-fatal)",
          );
        }
      }

      return { ok: true, gameId: gameId ?? undefined, signupsApplied };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: "handleEmail_error", error: message }, "handleEmail failed");
      return { ok: false, error: message };
    }
  }
}
