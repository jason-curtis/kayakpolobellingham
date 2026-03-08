import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { fetchAllMessages, decodeSnippet, messageUrl } from "@/lib/groups-io-api";
import { parseGameMessage, resolveName } from "@/lib/email-parser";

const GROUP_ID = 14099;

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const { D1_DB: db, GROUPS_IO_API_KEY: apiKey, OPENROUTER_API_KEY: openrouterKey } = env as {
      D1_DB: any; GROUPS_IO_API_KEY: string; OPENROUTER_API_KEY?: string;
    };

    if (!apiKey) {
      return NextResponse.json({ error: "GROUPS_IO_API_KEY not configured" }, { status: 500 });
    }

    const messages = await fetchAllMessages(apiKey, GROUP_ID);

    let updated = 0;
    let skipped = 0;

    for (const msg of messages) {
      const snippet = decodeSnippet(msg.snippet);
      const parsed = await parseGameMessage({
        subject: msg.subject,
        body: snippet,
        senderName: msg.name,
        referenceDate: msg.created,
        openrouterKey,
      });

      if (!parsed.isGameTopic || !parsed.gameDate || parsed.signups.length === 0) continue;

      const gameDate = parsed.gameDate;
      const signups = parsed.signups;

      const sourceUrl = messageUrl(msg.msg_num);
      const note = snippet.slice(0, 200);

      for (const signup of signups) {
        const resolved = resolveName(signup.name);
        const game = await db
          .prepare("SELECT id FROM games WHERE date = ?")
          .bind(gameDate)
          .first() as { id: string } | null;

        if (!game) { skipped++; continue; }

        // Overwrite only if this email is newer than what's stored.
        // source_at IS NULL covers scraped/legacy rows that have no timestamp yet.
        const result = await db
          .prepare(
            "UPDATE signups SET status = ?, note = ?, source_url = ?, source_type = 'email', source_at = ? WHERE game_id = ? AND player_name = ? AND (source_at IS NULL OR source_at <= ?)"
          )
          .bind(signup.status, note, sourceUrl, msg.created, game.id, resolved, msg.created)
          .run();

        if (result.meta?.changes > 0) updated++;
        else skipped++;
      }
    }

    return NextResponse.json({ ok: true, messagesProcessed: messages.length, signupsUpdated: updated, skipped });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json({ error: "Backfill failed", details: String(error) }, { status: 500 });
  }
}
