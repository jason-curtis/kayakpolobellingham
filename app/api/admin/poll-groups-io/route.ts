import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { pollForNewMessages } from "@/lib/poll-groups-io";

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const { env } = await getCloudflareContext();
    const { D1_DB, GROUPS_IO_API_KEY, OPENROUTER_API_KEY } = env as {
      D1_DB: any; GROUPS_IO_API_KEY: string; OPENROUTER_API_KEY?: string;
    };

    if (!GROUPS_IO_API_KEY) {
      return NextResponse.json(
        { error: "GROUPS_IO_API_KEY not configured" },
        { status: 500 },
      );
    }

    const result = await pollForNewMessages(D1_DB, GROUPS_IO_API_KEY, OPENROUTER_API_KEY);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Poll error:", error);
    return NextResponse.json(
      { error: "Poll failed", details: String(error) },
      { status: 500 },
    );
  }
}
