import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { buildSubject, buildBody } from "@/lib/game-on-notify";
import { fetchConditionsText } from "@/lib/conditions-text";

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const db = (env as any).D1_DB;

    // Find next upcoming game
    const today = new Date().toISOString().split("T")[0];
    const game = await db
      .prepare(
        "SELECT id, date, time, game_on_notified FROM games WHERE date >= ? ORDER BY date ASC LIMIT 1",
      )
      .bind(today)
      .first() as { id: string; date: string; time: string; game_on_notified: number } | null;

    if (!game) {
      return NextResponse.json({ error: "No upcoming games" }, { status: 404 });
    }

    // Get signups
    const { results: signupRows } = await db
      .prepare("SELECT player_name, status FROM signups WHERE game_id = ? ORDER BY created_at ASC")
      .bind(game.id)
      .all() as { results: { player_name: string; status: string }[] };

    const signups = {
      in: signupRows.filter(s => s.status === "in").map(s => ({ name: s.player_name })),
      out: signupRows.filter(s => s.status === "out").map(s => ({ name: s.player_name })),
      maybe: signupRows.filter(s => s.status === "maybe").map(s => ({ name: s.player_name })),
    };

    // Fetch live conditions
    let conditions: string;
    try {
      conditions = await fetchConditionsText(game.date, game.time);
    } catch {
      conditions = "Conditions unavailable";
    }

    const subject = buildSubject(game.date);
    const body = buildBody(game, signups, conditions);

    return NextResponse.json({
      gameId: game.id,
      date: game.date,
      inCount: signups.in.length,
      alreadySent: !!game.game_on_notified,
      subject,
      body,
    });
  } catch (error) {
    return NextResponse.json({ error: "Preview failed", details: String(error) }, { status: 500 });
  }
}
