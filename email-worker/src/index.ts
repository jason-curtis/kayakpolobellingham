import PostalMime from "postal-mime";
import { logger } from "./logger";

const ALLOW_LIST = ["thatneat@gmail.com"];

async function getTextBody(raw: ReadableStream): Promise<string> {
  const email = await PostalMime.parse(raw);
  return email.text ?? email.html?.replace(/<[^>]+>/g, " ").trim() ?? "";
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

    if (!ALLOW_LIST.includes(message.from)) {
      logger.warn(
        { event: "email_rejected", from: message.from, reason: "address not in allow list" },
        "address not allowed"
      );
      message.setReject("Address not allowed");
      return;
    }

    const textBody = await getTextBody(message.raw);

    try {
      await env.MAIN_APP.handleEmail({
        from: message.from,
        subject,
        textBody,
      });
      logger.info(
        { event: "email_handled", from: message.from, subject },
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
