import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { fetchMessagePage, extractJsonLd } from "@/lib/groups-io-scrape";
import { decodeSnippet } from "@/lib/groups-io-api";
import {
  isGameTopic,
  extractGameDate,
  parseSignupsFromMessage,
  resolveName,
  resolveSender,
} from "@/lib/email-parser";
import { llmExtractDate, llmParse } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { url } = (await request.json()) as { url: string };
  const match = url.match(/\/message\/(\d+)/);
  if (!match) {
    return NextResponse.json({ error: "Could not extract message number from URL" }, { status: 400 });
  }
  const msgNum = parseInt(match[1], 10);

  try {
    // Fetch and parse message HTML
    const html = await fetchMessagePage(msgNum);
    if (!html) {
      return NextResponse.json({ error: `Message ${msgNum} not found (404)` }, { status: 404 });
    }
    const ld = extractJsonLd(html);
    if (!ld) {
      return NextResponse.json({ error: "Could not extract JSON-LD from message page" }, { status: 422 });
    }

    const subject = ld.headline ?? "";
    const senderRaw = ld.author?.name ?? "";
    const body = decodeSnippet(ld.text ?? "");
    const created = ld.datePublished ?? null;

    // Run all parsing steps
    const resolvedSender = resolveSender(senderRaw);
    const gameTopic = isGameTopic(subject);
    const dateNoRef = extractGameDate(subject);
    const dateWithRef = created ? extractGameDate(subject, created) : null;
    const signups = parseSignupsFromMessage(body, senderRaw, { resolveName, resolveSender });

    // LLM results (if key available)
    let llmDate: string | null = null;
    let llmFull = null;
    try {
      const { env } = await getCloudflareContext();
      const openrouterKey = (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY;
      if (openrouterKey) {
        const ref = created?.slice(0, 10);
        [llmDate, llmFull] = await Promise.all([
          llmExtractDate(openrouterKey, subject, body, ref),
          llmParse(openrouterKey, subject, body, ref),
        ]);
      }
    } catch {}

    return NextResponse.json({
      raw: { msgNum, subject, sender: senderRaw, resolvedSender, body, created },
      isGameTopic: gameTopic,
      extractGameDate: { withoutRef: dateNoRef, withRef: dateWithRef, refUsed: created },
      signups,
      llm: { extractDate: llmDate, parse: llmFull },
    });
  } catch (error) {
    return NextResponse.json({ error: "Debug failed", details: String(error) }, { status: 500 });
  }
}
