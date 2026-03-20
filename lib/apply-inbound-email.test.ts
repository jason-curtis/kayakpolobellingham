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
    vi.mocked(d1.updateGame).mockReset();
    vi.mocked(d1.countMidweekGamesInYear).mockReset();
    vi.mocked(d1.countMidweekGamesInYear).mockResolvedValue(0);
  });

  it("returns no game and zero signups when gameDate is missing", async () => {
    const result: EmailParseResult = {
      senderName: "Bob",
      signups: [{ name: "Bob", status: "in" }],
      gameDate: null,
      isGameTopic: true,
      isCancellation: false,
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
      isCancellation: false,
      rawBody: "",
    };
    const out = await applyInboundEmail(mockDb, result);
    expect(out).toEqual({ gameId: null, signupsApplied: 0 });
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
      isCancellation: false,
      rawBody: "Jason in, Dorothy out",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.getGameByDate).toHaveBeenCalledWith(mockDb, "2026-03-01");
    expect(d1.createGame).not.toHaveBeenCalled();
    expect(d1.addSignup).toHaveBeenCalledTimes(2);
    expect(d1.addSignup).toHaveBeenNthCalledWith(1, "game-123", "Jason", "in", mockDb, {
      source_url: null,
      source_type: "email",
      source_at: null,
    });
    expect(d1.addSignup).toHaveBeenNthCalledWith(2, "game-123", "Dorothy", "out", mockDb, {
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
      isCancellation: false,
      rawBody: "I'm in",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.getGameByDate).toHaveBeenCalledWith(mockDb, "2026-03-01");
    expect(d1.createGame).toHaveBeenCalledWith("2026-03-01", "09:00", undefined, mockDb);
    expect(d1.addSignup).toHaveBeenCalledWith("game-new", "Gary", "in", mockDb, {
      source_url: null,
      source_type: "email",
      source_at: null,
    });
    expect(out).toEqual({ gameId: "game-new", signupsApplied: 1 });
  });

  it("sets game status to cancelled for cancellation subjects", async () => {
    vi.mocked(d1.getGameByDate).mockResolvedValue({ id: "game-123" });
    vi.mocked(d1.updateGame).mockResolvedValue({});

    const result: EmailParseResult = {
      senderName: "Dorothy",
      signups: [],
      gameDate: "2026-03-11",
      isGameTopic: true,
      isCancellation: true,
      rawBody: "Not enough players",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.updateGame).toHaveBeenCalledWith("game-123", { status: "cancelled" }, mockDb);
    expect(d1.addSignup).not.toHaveBeenCalled();
    expect(out).toEqual({ gameId: "game-123", signupsApplied: 0 });
  });

  it("creates cancelled game when none exists for cancellation", async () => {
    vi.mocked(d1.getGameByDate).mockResolvedValue(null);
    vi.mocked(d1.createGame).mockResolvedValue({ id: "2026-03-11" } as any);
    vi.mocked(d1.updateGame).mockResolvedValue({});

    const result: EmailParseResult = {
      senderName: "Dorothy",
      signups: [],
      gameDate: "2026-03-11",
      isGameTopic: true,
      isCancellation: true,
      rawBody: "Game cancelled",
    };
    const out = await applyInboundEmail(mockDb, result);

    expect(d1.createGame).toHaveBeenCalled();
    expect(d1.updateGame).toHaveBeenCalledWith("2026-03-11", { status: "cancelled" }, mockDb);
    expect(out).toEqual({ gameId: "2026-03-11", signupsApplied: 0 });
  });
});
