import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { buildSubject, buildBody, buildConditionsSubject, buildConditionsBody } from "@/lib/game-on-notify";
import { fetchConditionsText } from "@/lib/conditions-text";
import { createGroupsIoSender } from "@/lib/send-email";

const GROUP_EMAIL = "kayakpolobellingham@groups.io";

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { gameId, type } = await request.json() as { gameId: string; type: string };

    if (!gameId) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }
    if (!type || !["game_on", "conditions"].includes(type)) {
      return NextResponse.json({ error: "type must be 'game_on' or 'conditions'" }, { status: 400 });
    }

    const { env } = await getCloudflareContext();
    const db = (env as any).D1_DB;
    const apiKey = (env as any).GROUPS_IO_API_KEY as string;

    if (!apiKey) {
      return NextResponse.json({ error: "GROUPS_IO_API_KEY not configured" }, { status: 500 });
    }

    // Fetch game
    const game = await db
      .prepare("SELECT id, date, time, game_on_notified FROM games WHERE id = ?")
      .bind(gameId)
      .first() as { id: string; date: string; time: string; game_on_notified: number } | null;

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
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

    // Fetch conditions
    let conditions: string;
    try {
      conditions = await fetchConditionsText(game.date, game.time);
    } catch {
      conditions = "Conditions unavailable";
    }

    // Build email
    const subject = type === "conditions"
      ? buildConditionsSubject(game.date)
      : buildSubject(game.date);
    const body = type === "conditions"
      ? buildConditionsBody(game, signups, conditions)
      : buildBody(game, signups, conditions);

    // Send
    const sendEmail = createGroupsIoSender(apiKey);
    await sendEmail(GROUP_EMAIL, subject, body);

    return NextResponse.json({ sent: true, subject });
  } catch (error) {
    return NextResponse.json({ error: "Send failed", details: String(error) }, { status: 500 });
  }
}
