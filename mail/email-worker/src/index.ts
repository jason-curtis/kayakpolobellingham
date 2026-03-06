import PostalMime from "postal-mime";

interface Env {
  MAIN_APP: Fetcher;
  EMAIL_INBOUND_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(raw);

    const payload = {
      from: message.from,
      subject: parsed.subject || "(no subject)",
      textBody: parsed.text || "",
    };

    const resp = await env.MAIN_APP.fetch("https://email-relay/api/email-inbound", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.EMAIL_INBOUND_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Inbound API error ${resp.status}: ${text}`);
    }
  },
};
