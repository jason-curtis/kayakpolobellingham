/**
 * Custom worker: wraps OpenNext fetch handler and adds RPC entrypoint for inbound email.
 * Wrangler main should point here so the email worker can call handleEmail via service binding.
 * Type-check with: pnpm exec tsc -p tsconfig.worker.json
 */
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from "cloudflare:workers";
import { parseInboundEmail } from "./lib/email-parser";
import { applyInboundEmail } from "./lib/apply-inbound-email";

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

      if (!result.isGameTopic || result.signups.length === 0) {
        return { ok: true, signupsApplied: 0 };
      }

      const db = this.env.D1_DB;
      const { gameId, signupsApplied } = await applyInboundEmail(db, result);
      return { ok: true, gameId: gameId ?? undefined, signupsApplied };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("handleEmail error:", message);
      return { ok: false, error: message };
    }
  }
}
