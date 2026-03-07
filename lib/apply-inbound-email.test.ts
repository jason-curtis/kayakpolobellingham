import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyInboundEmail } from "./apply-inbound-email";
import type { EmailParseResult } from "./email-parser";
import * as d1 from "./d1";

vi.mock("./d1");

describe("applyInboundEmail", () => {
  const mockDb = {};

  beforeEach(() => {
    vi.mocked(d1.getGameByDate).mockReset();
    vi.mocked(d1.createGame).mockReset();
    vi.mocked(d1.addSignup).mockReset();
  });

  it("returns no game and zero signups when gameDate is missing", async () => {
    const result: EmailParseResult = {
      senderName: "Bob",
      signups: [{ name: "Bob", status: "in" }],
      gameDate: null,
      isGameTopic: true,
      rawBody: "in",
    };
    const out = await applyInboundEmail(mockDb, result);
    expect(out).toEqual({ gameId: null, signupsApplied: 0 });
    expect(d1.getGameByDate).not.toHaveBeenCalled();
  });

  it("returns no game and zero signups when signups are empty", async () => {
    const result: EmailParseResult = {
      senderName: "Bob",
      signups: [],
      gameDate: "2026-03-01",
      isGameTopic: true,
      rawBody: "",
    };
    const out = await applyInboundEmail(mockDb, result);
    expect(out).toEqual({ gameId: null, signupsApplied: 0 });
    expect(d1.getGameByDate).not.toHaveBeenCalled();
  });

  it("uses existing game and calls addSignup for each signup", async () => {
    vi.mocked(d1.getGameByDate).mockResolvedValue({ id: "game-123" });
    vi.mocked(d1.addSignup).mockResolvedValue({ success: true });

    const result: EmailParseResult = {
      senderName: "Bob",
      signups: [
        { name: "Jason", status: "in" },
        { name: "Dorothy", status: "out" },
      ],
      gameDate: "2026-03-01",
      isGameTopic: true,
      rawBody: "Jason in, Dorothy out",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.getGameByDate).toHaveBeenCalledWith(mockDb, "2026-03-01");
    expect(d1.createGame).not.toHaveBeenCalled();
    expect(d1.addSignup).toHaveBeenCalledTimes(2);
    expect(d1.addSignup).toHaveBeenNthCalledWith(1, "game-123", "Jason", "in", mockDb, {
      note: "Jason in, Dorothy out",
      source_url: null,
      source_type: "email",
      source_at: null,
    });
    expect(d1.addSignup).toHaveBeenNthCalledWith(2, "game-123", "Dorothy", "out", mockDb, {
      note: "Jason in, Dorothy out",
      source_url: null,
      source_type: "email",
      source_at: null,
    });
    expect(out).toEqual({ gameId: "game-123", signupsApplied: 2 });
  });

  it("creates game when none exists then adds signups", async () => {
    vi.mocked(d1.getGameByDate).mockResolvedValue(null);
    vi.mocked(d1.createGame).mockResolvedValue({ id: "game-new" } as any);
    vi.mocked(d1.addSignup).mockResolvedValue({ success: true });

    const result: EmailParseResult = {
      senderName: "Bob",
      signups: [{ name: "Gary", status: "in" }],
      gameDate: "2026-03-01",
      isGameTopic: true,
      rawBody: "I'm in",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.getGameByDate).toHaveBeenCalledWith(mockDb, "2026-03-01");
    expect(d1.createGame).toHaveBeenCalledWith("2026-03-01", undefined, undefined, mockDb);
    expect(d1.addSignup).toHaveBeenCalledWith("game-new", "Gary", "in", mockDb, {
      note: "I'm in",
      source_url: null,
      source_type: "email",
      source_at: null,
    });
    expect(out).toEqual({ gameId: "game-new", signupsApplied: 1 });
  });
});
