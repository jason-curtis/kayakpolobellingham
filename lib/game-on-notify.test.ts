import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSubject, buildBody, checkAndNotify } from "./game-on-notify";
import type { GameInfo, SignupList, SendEmailFn } from "./game-on-notify";

// ── buildSubject ──────────────────────────────────────────────────────────────

describe("buildSubject", () => {
  it("formats Sunday date correctly", () => {
    expect(buildSubject("2026-03-08")).toBe("Sunday 8/3 game on!");
  });

  it("formats Wednesday date correctly", () => {
    expect(buildSubject("2026-03-11")).toBe("Wednesday 11/3 game on!");
  });

  it("formats Saturday date correctly", () => {
    expect(buildSubject("2026-03-07")).toBe("Saturday 7/3 game on!");
  });
});

// ── buildBody ────────────────────────────────────────────────────────────────

describe("buildBody", () => {
  const game: GameInfo = {
    id: "game-123",
    date: "2026-03-08",
    time: "09:00",
    game_on_notified: 0,
  };

  const signups: SignupList = {
    in: [{ name: "Jason" }, { name: "Gary" }, { name: "Dorothy" }, { name: "Dave" }, { name: "Paul" }, { name: "Steve" }],
    out: [{ name: "Bob" }],
    maybe: [{ name: "Alice" }],
  };

  it("includes all sections", () => {
    const body = buildBody(game, signups, "Tide flooding 2.1ft → 5.8ft during game\n48°F, clear skies, wind NNE 5mph");

    // Header
    expect(body).toContain("Sunday 8/3 — Game on!");

    // In list
    expect(body).toContain("IN:");
    expect(body).toContain("  Jason");
    expect(body).toContain("  Steve");

    // Maybe list
    expect(body).toContain("MAYBE:");
    expect(body).toContain("  Alice");

    // Out list
    expect(body).toContain("OUT:");
    expect(body).toContain("  Bob");

    // Conditions
    expect(body).toContain("CONDITIONS:");
    expect(body).toContain("Tide flooding");
    expect(body).toContain("48°F");

    // Game permalink
    expect(body).toContain("https://kayakpolosignups.option-zero.workers.dev/games/game-123");

    // No time/location
    expect(body).not.toContain("Time:");
    expect(body).not.toContain("Location:");

    // Bot disclaimer
    expect(body).toContain("automated message");
  });

  it("omits empty sections", () => {
    const noMaybes: SignupList = {
      in: [{ name: "Jason" }],
      out: [],
      maybe: [],
    };
    const body = buildBody(game, noMaybes, "Conditions unavailable");
    expect(body).not.toContain("MAYBE:");
    expect(body).not.toContain("OUT:");
    expect(body).toContain("IN:");
  });

  it("includes game permalink with game id", () => {
    const body = buildBody(game, signups, "Conditions unavailable");
    expect(body).toContain("/games/game-123");
  });
});

// ── checkAndNotify ───────────────────────────────────────────────────────────

describe("checkAndNotify", () => {
  let mockDb: any;
  let sendEmail: SendEmailFn;

  beforeEach(() => {
    sendEmail = vi.fn().mockResolvedValue(undefined);

    // Build a mock D1 with chainable prepare/bind/first/all/run
    mockDb = {
      _data: {} as Record<string, any>,
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("returns game_not_found when game doesn't exist", async () => {
    mockDb.first.mockResolvedValue(null);

    const result = await checkAndNotify(mockDb, "game-xxx", sendEmail);
    expect(result).toEqual({ sent: false, reason: "game_not_found" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns already_notified when game_on_notified is 1", async () => {
    mockDb.first
      .mockResolvedValueOnce({ id: "game-123", date: "2026-03-08", time: "09:00", game_on_notified: 1 });

    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: false, reason: "already_notified" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns below_threshold when fewer than 6 'in' signups", async () => {
    mockDb.first
      .mockResolvedValueOnce({ id: "game-123", date: "2026-03-08", time: "09:00", game_on_notified: 0 })
      .mockResolvedValueOnce({ count: 5 });

    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: false, reason: "below_threshold" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends notification when threshold reached", async () => {
    mockDb.first
      .mockResolvedValueOnce({ id: "game-123", date: "2026-03-08", time: "09:00", game_on_notified: 0 })
      .mockResolvedValueOnce({ count: 6 });
    mockDb.all.mockResolvedValueOnce({
      results: [
        { player_name: "Jason", status: "in" },
        { player_name: "Gary", status: "in" },
        { player_name: "Dorothy", status: "in" },
        { player_name: "Dave", status: "in" },
        { player_name: "Paul", status: "in" },
        { player_name: "Steve", status: "in" },
        { player_name: "Bob", status: "out" },
      ],
    });

    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: true });

    // Verify email was sent
    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, subject, body] = (sendEmail as any).mock.calls[0];
    expect(to).toBe("kayakpolobellingham@groups.io");
    expect(subject).toBe("Sunday 8/3 game on!");
    expect(body).toContain("Game on!");
    expect(body).toContain("Jason");
    expect(body).toContain("Steve");
    expect(body).toContain("Bob");

    // Verify game was marked as notified
    expect(mockDb.prepare).toHaveBeenCalledWith(
      "UPDATE games SET game_on_notified = 1, updated_at = ? WHERE id = ?"
    );
  });

  it("does not mark as notified when send fails", async () => {
    mockDb.first
      .mockResolvedValueOnce({ id: "game-123", date: "2026-03-08", time: "09:00", game_on_notified: 0 })
      .mockResolvedValueOnce({ count: 6 });
    mockDb.all.mockResolvedValueOnce({
      results: [
        { player_name: "Jason", status: "in" },
        { player_name: "Gary", status: "in" },
        { player_name: "Dorothy", status: "in" },
        { player_name: "Dave", status: "in" },
        { player_name: "Paul", status: "in" },
        { player_name: "Steve", status: "in" },
      ],
    });

    (sendEmail as any).mockRejectedValueOnce(new Error("network error"));

    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: false, reason: "send_failed" });

    // Should NOT have called update to mark as notified
    const updateCalls = mockDb.prepare.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("UPDATE games SET game_on_notified")
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("sends with more than 6 signups (7+)", async () => {
    mockDb.first
      .mockResolvedValueOnce({ id: "game-123", date: "2026-03-08", time: "09:00", game_on_notified: 0 })
      .mockResolvedValueOnce({ count: 8 });
    mockDb.all.mockResolvedValueOnce({
      results: Array.from({ length: 8 }, (_, i) => ({ player_name: `Player${i}`, status: "in" })),
    });

    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});
