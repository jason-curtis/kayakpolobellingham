import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth";
import { fetchMessageByNum, decodeSnippet, stripHtml, messageUrl } from "@/lib/groups-io-api";
import { fetchMessagePage, extractJsonLd } from "@/lib/groups-io-scrape";
import {
  isGameTopic,
  extractGameDate,
  parseSignupsFromMessage,
  parseGameMessage,
  resolveName,
  resolveSender,
} from "@/lib/email-parser";
import { llmParseDebug } from "@/lib/openrouter";
import { applyInboundEmail } from "@/lib/apply-inbound-email";

const GROUP_ID = 14099;

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { url, apply } = (await request.json()) as { url: string; apply?: boolean };
  const match = url.match(/\/message\/(\d+)/);
  if (!match) {
    return NextResponse.json({ error: "Could not extract message number from URL" }, { status: 400 });
  }
  const msgNum = parseInt(match[1], 10);

  try {
    const { env } = await getCloudflareContext();
    const { D1_DB: db, GROUPS_IO_API_KEY: apiKey, OPENROUTER_API_KEY: openrouterKey } = env as {
      D1_DB: any;
      GROUPS_IO_API_KEY?: string;
      OPENROUTER_API_KEY?: string;
    };

    let subject = "";
    let senderRaw = "";
    let body = "";
    let created: string | null = null;
    let source = "unknown";

    // Primary: use Groups.io API (authenticated, reliable from Workers)
    if (apiKey) {
      const msg = await fetchMessageByNum(apiKey, GROUP_ID, msgNum);
      if (msg) {
        subject = msg.subject;
        senderRaw = msg.name;
        body = msg.body ? stripHtml(msg.body) : decodeSnippet(msg.snippet || "");
        created = msg.created;
        source = "api";
      }
    }

    // Fallback: scrape HTML page for JSON-LD
    if (!source || source === "unknown") {
      const html = await fetchMessagePage(msgNum);
      if (!html) {
        return NextResponse.json({ error: `Message ${msgNum} not found (404)` }, { status: 404 });
      }
      const ld = extractJsonLd(html);
      if (!ld) {
        return NextResponse.json({
          error: "Could not fetch message via API (no key?) or extract JSON-LD from page",
        }, { status: 422 });
      }
      subject = ld.headline ?? "";
      senderRaw = ld.author?.name ?? "";
      body = decodeSnippet(ld.text ?? "");
      created = ld.datePublished ?? null;
      source = "html-scrape";
    }

    // Unified parse (same code path as production)
    const unified = await parseGameMessage({
      subject,
      body,
      senderName: senderRaw,
      referenceDate: created ?? undefined,
      openrouterKey,
    });

    // Also show individual regex steps for debugging comparison
    const dateNoRef = extractGameDate(subject);
    const dateWithRef = created ? extractGameDate(subject, created) : null;
    const rawSignups = parseSignupsFromMessage(body, senderRaw, { resolveName, resolveSender });

    // Standalone LLM parse (for comparison) — always show diagnostic info
    let llmResult: Record<string, unknown> | null = null;
    if (openrouterKey) {
      const debug = await llmParseDebug(openrouterKey, subject, body, created?.slice(0, 10));
      llmResult = {
        ...debug.result,
        _debug: {
          error: debug.error,
          raw_response: debug.raw_response,
          model: debug.model,
          latency_ms: debug.latency_ms,
        },
      };
    } else {
      llmResult = { _debug: { error: "OPENROUTER_API_KEY not configured", model: null, latency_ms: 0 } };
    }

    // Apply to D1 if requested
    let applied = null;
    if (apply && unified.isGameTopic && unified.gameDate && unified.signups.length > 0) {
      const result = await applyInboundEmail(
        db,
        unified,
        messageUrl(msgNum),
        created ?? undefined,
      );
      applied = { gameId: result.gameId, signupsApplied: result.signupsApplied };
    }

    return NextResponse.json({
      source,
      raw: { msgNum, subject, sender: senderRaw, resolvedSender: unified.senderName, body, created },
      unified: {
        isGameTopic: unified.isGameTopic,
        gameDate: unified.gameDate,
        signups: unified.signups,
        senderName: unified.senderName,
      },
      debug: {
        extractGameDate: { withoutRef: dateNoRef, withRef: dateWithRef, refUsed: created },
        rawSignups,
        llmParse: llmResult,
      },
      ...(applied ? { applied } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: "Debug failed", details: String(error) }, { status: 500 });
  }
}
