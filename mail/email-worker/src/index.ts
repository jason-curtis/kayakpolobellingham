import PostalMime from "postal-mime";

interface Env {
  MAIN_APP: Service;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(raw);

    const result = await env.MAIN_APP.handleEmail({
      from: message.from,
      subject: parsed.subject || "(no subject)",
      textBody: parsed.text || "",
    });

    if (!result.ok) {
      console.error(`handleEmail error: ${result.error}`);
    }
  },
};
