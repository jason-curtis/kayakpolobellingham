import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { resolveName } from "@/lib/email-parser";

/** Find and merge duplicate signups caused by "Via Groups.io" name suffixes. */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const db = (env as { D1_DB: any }).D1_DB;

    // Find all signups with "via groups.io" in the player_name
    const { results: dupes } = await db
      .prepare("SELECT id, game_id, player_name, status, source_url, source_at FROM signups WHERE LOWER(player_name) LIKE '%via groups.io%'")
      .all();

    let merged = 0;
    let renamed = 0;
    const details: string[] = [];

    for (const dupe of dupes as any[]) {
      const cleanName = resolveName(dupe.player_name);

      // Check if there's already a signup with the clean name for this game
      const existing = await db
        .prepare("SELECT id, source_url FROM signups WHERE game_id = ? AND player_name = ?")
        .bind(dupe.game_id, cleanName)
        .first();

      if (existing) {
        // Clean-name signup exists — copy source_url to it if it's missing, then delete the dupe
        if (!existing.source_url && dupe.source_url) {
          await db
            .prepare("UPDATE signups SET source_url = ? WHERE id = ?")
            .bind(dupe.source_url, existing.id)
            .run();
        }
        await db.prepare("DELETE FROM signups WHERE id = ?").bind(dupe.id).run();
        details.push(`merged "${dupe.player_name}" → "${cleanName}" (game ${dupe.game_id})`);
        merged++;
      } else {
        // No clean-name signup — just rename the dupe
        await db
          .prepare("UPDATE signups SET player_name = ? WHERE id = ?")
          .bind(cleanName, dupe.id)
          .run();
        details.push(`renamed "${dupe.player_name}" → "${cleanName}" (game ${dupe.game_id})`);
        renamed++;
      }
    }

    return NextResponse.json({ ok: true, merged, renamed, details });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: "Cleanup failed", details: String(error) }, { status: 500 });
  }
}
