import PostalMime from "postal-mime";

const ALLOW_LIST = ["friend@example.com", "coworker@example.com"];

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
    if (!ALLOW_LIST.includes(message.from)) {
      message.setReject("Address not allowed");
      return;
    }

    const subject = message.headers.get("subject") ?? "";
    const textBody = await getTextBody(message.raw);

    await env.MAIN_APP.handleEmail({
      from: message.from,
      subject,
      textBody,
    });
  },
};
