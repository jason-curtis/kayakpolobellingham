/**
 * Custom worker: wraps OpenNext fetch handler and adds RPC entrypoint for inbound email.
 * Wrangler main should point here so the email worker can call handleEmail via service binding.
 * Type-check with: pnpm exec tsc -p tsconfig.worker.json
 */
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from "cloudflare:workers";
import { parseInboundEmail } from "./lib/email-parser";
import { applyInboundEmail } from "./lib/apply-inbound-email";
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
}

export default class KayakPoloWorker extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    return (nextHandler as { fetch: (req: Request, e: Env, c: ExecutionContext) => Promise<Response> }).fetch(
      request,
      this.env,
      this.ctx
    );
  }

  async handleEmail(payload: IncomingEmailPayload): Promise<{ ok: boolean; gameId?: string; signupsApplied?: number; error?: string }> {
    try {
      const result = parseInboundEmail({
        from: payload.from,
        subject: payload.subject,
        textBody: payload.textBody ?? "",
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
      return { ok: true, gameId: gameId ?? undefined, signupsApplied };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: "handleEmail_error", error: message }, "handleEmail failed");
      return { ok: false, error: message };
    }
  }
}
