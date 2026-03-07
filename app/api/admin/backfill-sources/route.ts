import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { fetchAllMessages, decodeSnippet, messageUrl } from "@/lib/groups-io-api";
import { isGameTopic, extractGameDate, parseSignupsFromMessage, resolveName, resolveSender } from "@/lib/email-parser";
import { llmExtractDate } from "@/lib/openrouter";

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

    // Clear previous backfill data so stale matches don't persist
    await db
      .prepare("UPDATE signups SET note = NULL, source_url = NULL, source_type = NULL WHERE source_type = 'email'")
      .run();

    const messages = await fetchAllMessages(apiKey, GROUP_ID);

    let updated = 0;
    let skipped = 0;

    for (const msg of messages) {
      if (!isGameTopic(msg.subject)) continue;

      const snippet = decodeSnippet(msg.snippet);
      const senderName = resolveSender(msg.name);
      const signups = parseSignupsFromMessage(snippet, senderName, { resolveName, resolveSender });
      let gameDate = extractGameDate(msg.subject, msg.created);

      // LLM fallback for date extraction
      if (!gameDate && openrouterKey) {
        gameDate = await llmExtractDate(openrouterKey, msg.subject, snippet);
      }

      if (!gameDate || signups.length === 0) continue;

      const sourceUrl = messageUrl(msg.msg_num);
      const note = snippet.slice(0, 200);

      for (const signup of signups) {
        const resolved = resolveName(signup.name);
        const game = await db
          .prepare("SELECT id FROM games WHERE date = ?")
          .bind(gameDate)
          .first() as { id: string } | null;

        if (!game) { skipped++; continue; }

        // Fully overwrite: status + note + source, but only if this message
        // is newer than what's already stored (messages arrive oldest-first)
        const result = await db
          .prepare(
            "UPDATE signups SET status = ?, note = ?, source_url = ?, source_type = 'email', updated_at = ? WHERE game_id = ? AND player_name = ? AND updated_at <= ?"
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
