import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { fetchAllMessages, decodeSnippet, stripHtml, messageUrl } from "@/lib/groups-io-api";
import { parseGameMessage, resolveName } from "@/lib/email-parser";

const GROUP_ID = 14099;

/** Find and merge duplicate signups caused by "Via Groups.io" name suffixes. */
async function cleanupViaGroupsIoDuplicates(db: any): Promise<{ merged: number; renamed: number }> {
  // Find all signups with "via groups.io" in the player_name
  const { results: dupes } = await db
    .prepare("SELECT id, game_id, player_name, status, source_url, source_at FROM signups WHERE LOWER(player_name) LIKE '%via groups.io%'")
    .all() as { results: { id: string; game_id: string; player_name: string; status: string; source_url: string | null; source_at: string | null }[] };

  let merged = 0;
  let renamed = 0;

  for (const dupe of dupes) {
    const cleanName = resolveName(dupe.player_name);

    // Check if there's already a signup with the clean name for this game
    const existing = await db
      .prepare("SELECT id, source_url FROM signups WHERE game_id = ? AND player_name = ?")
      .bind(dupe.game_id, cleanName)
      .first() as { id: string; source_url: string | null } | null;

    if (existing) {
      // Clean-name signup exists — copy source_url to it if it's missing, then delete the dupe
      if (!existing.source_url && dupe.source_url) {
        await db
          .prepare("UPDATE signups SET source_url = ? WHERE id = ?")
          .bind(dupe.source_url, existing.id)
          .run();
      }
      await db.prepare("DELETE FROM signups WHERE id = ?").bind(dupe.id).run();
      merged++;
    } else {
      // No clean-name signup — just rename the dupe
      await db
        .prepare("UPDATE signups SET player_name = ? WHERE id = ?")
        .bind(cleanName, dupe.id)
        .run();
      renamed++;
    }
  }

  return { merged, renamed };
}

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

    // Step 1: Clean up "Via Groups.io" duplicates
    const cleanup = await cleanupViaGroupsIoDuplicates(db);

    // Step 2: Re-parse all messages and update source URLs
    const messages = await fetchAllMessages(apiKey, GROUP_ID);

    let updated = 0;
    let skipped = 0;

    for (const msg of messages) {
      const body = msg.body ? stripHtml(msg.body) : decodeSnippet(msg.snippet);
      const parsed = await parseGameMessage({
        subject: msg.subject,
        body,
        senderName: msg.name,
        referenceDate: msg.created,
        openrouterKey,
      });

      if (!parsed.isGameTopic || !parsed.gameDate || parsed.signups.length === 0) continue;

      const gameDate = parsed.gameDate;
      const signups = parsed.signups;

      const sourceUrl = messageUrl(msg.msg_num);
      const note = body.slice(0, 200);

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

    return NextResponse.json({
      ok: true,
      cleanup: { duplicatesMerged: cleanup.merged, duplicatesRenamed: cleanup.renamed },
      messagesProcessed: messages.length,
      signupsUpdated: updated,
      skipped,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json({ error: "Backfill failed", details: String(error) }, { status: 500 });
  }
}
