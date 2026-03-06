import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseInboundEmail } from "@/lib/email-parser";
import { applyInboundEmail } from "@/lib/apply-inbound-email";

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext();
  const secret = (env as { EMAIL_INBOUND_SECRET?: string }).EMAIL_INBOUND_SECRET;

  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as { from: string; subject: string; textBody: string };
    if (!body.from || !body.subject || !body.textBody) {
      return NextResponse.json({ error: "Missing required fields: from, subject, textBody" }, { status: 400 });
    }

    const parsed = parseInboundEmail(body);
    const db = (env as { D1_DB: any }).D1_DB;
    const { gameId, signupsApplied } = await applyInboundEmail(db, parsed);

    return NextResponse.json({
      ok: true,
      gameDate: parsed.gameDate,
      gameId,
      signupsApplied,
      senderName: parsed.senderName,
      isGameTopic: parsed.isGameTopic,
    });
  } catch (error) {
    console.error("Email inbound error:", error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
