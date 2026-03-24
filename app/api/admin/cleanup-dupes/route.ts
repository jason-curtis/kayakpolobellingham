import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { resolveName } from "@/lib/email-parser";

/** Find signups whose player_name resolves to a different canonical name and merge/rename them. */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const db = (env as { D1_DB: any }).D1_DB;

    const { results: allSignups } = await db
      .prepare("SELECT id, game_id, player_name, status, source_url, source_at FROM signups")
      .all();

    let merged = 0;
    let renamed = 0;
    const details: string[] = [];

    for (const signup of allSignups as any[]) {
      const cleanName = resolveName(signup.player_name);
      if (cleanName === signup.player_name) continue; // already canonical

      // Check if there's already a signup with the clean name for this game
      const existing = await db
        .prepare("SELECT id, source_url FROM signups WHERE game_id = ? AND player_name = ?")
        .bind(signup.game_id, cleanName)
        .first();

      if (existing) {
        // Canonical-name signup exists — copy source_url to it if missing, then delete the dupe
        if (!existing.source_url && signup.source_url) {
          await db
            .prepare("UPDATE signups SET source_url = ? WHERE id = ?")
            .bind(signup.source_url, existing.id)
            .run();
        }
        await db.prepare("DELETE FROM signups WHERE id = ?").bind(signup.id).run();
        details.push(`merged "${signup.player_name}" → "${cleanName}" (game ${signup.game_id})`);
        merged++;
      } else {
        // No canonical-name signup — rename the dupe
        await db
          .prepare("UPDATE signups SET player_name = ? WHERE id = ?")
          .bind(cleanName, signup.id)
          .run();
        details.push(`renamed "${signup.player_name}" → "${cleanName}" (game ${signup.game_id})`);
        renamed++;
      }
    }

    return NextResponse.json({ ok: true, merged, renamed, details });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: "Cleanup failed", details: String(error) }, { status: 500 });
  }
}
