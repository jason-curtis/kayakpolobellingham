import PostalMime from "postal-mime";
import { logger } from "./logger";

const ALLOW_LIST = ["thatneat@gmail.com"];

async function matchesAllowList(from: string): Promise<boolean> {
  // cloudflare email handling turns sender into something like
  // thatneat+caf_=kayak-polo-signup=magamoney.fyi@gmail.com
  // if it was originally thatneat@gmail.com.
  const allowed_prefix_suffix_combinations = ALLOW_LIST.map(email => email.split('@'));

  const [from_before_at, from_after_at] = from.split('@');
  return allowed_prefix_suffix_combinations.some(combination => {
    return from_before_at.startsWith(combination[0]) && combination[1] === from_after_at;
  });
}

interface ParsedEmail {
  textBody: string;
  /** MIME From header (original sender), if available */
  mimeFrom: string | null;
}

async function parseEmail(raw: ReadableStream): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  const textBody = email.text ?? email.html?.replace(/<[^>]+>/g, " ").trim() ?? "";

  // Extract original sender from MIME From header.
  // When Gmail auto-forwards, the envelope From is rewritten (e.g. user+caf_=dest@gmail.com)
  // but the MIME From header preserves the original sender.
  let mimeFrom: string | null = null;
  if (email.from) {
    const addr = email.from;
    if (addr.name && addr.address) {
      mimeFrom = `${addr.name} <${addr.address}>`;
    } else if (addr.address) {
      mimeFrom = addr.address;
    } else if (addr.name) {
      mimeFrom = addr.name;
    }
  }

  return { textBody, mimeFrom };
}

export default {
  async email(
    message: { from: string; raw: ReadableStream; headers: Headers; setReject(reason?: string): void },
    env: { MAIN_APP: { handleEmail(payload: { from: string; subject: string; textBody: string }): Promise<unknown> } },
    _ctx: ExecutionContext
  ) {
    const subject = message.headers.get("subject") ?? "";

    logger.info(
      { event: "email_received", from: message.from, subject },
      "inbound email received"
    );

    if (!await matchesAllowList(message.from)) {
      logger.warn(
        { event: "email_rejected", from: message.from, reason: "address not in allow list" },
        "address not allowed"
      );
      message.setReject("Address not allowed");
      return;
    }

    const { textBody, mimeFrom } = await parseEmail(message.raw);

    // Use the MIME From header (original sender) when available, falling back to
    // the envelope From. Gmail auto-forwarding rewrites the envelope From to
    // something like thatneat+caf_=kayak-polo-signup=magamoney.fyi@gmail.com,
    // but the MIME From preserves the original sender identity.
    const effectiveFrom = mimeFrom ?? message.from;

    logger.info(
      { event: "email_from_resolved", envelopeFrom: message.from, mimeFrom, effectiveFrom },
      "resolved sender from MIME headers"
    );

    try {
      await env.MAIN_APP.handleEmail({
        from: effectiveFrom,
        subject,
        textBody,
      });
      logger.info(
        { event: "email_handled", from: effectiveFrom, envelopeFrom: message.from, subject },
        "email forwarded to main app"
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { event: "email_handle_error", from: message.from, subject, error: errMsg },
        "handleEmail failed"
      );
      throw err;
    }
  },
};
