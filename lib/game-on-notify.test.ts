import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSubject, buildBody, checkAndNotify } from "./game-on-notify";
import type { GameInfo, SignupList, SendEmailFn } from "./game-on-notify";

vi.mock("./conditions-text", () => ({
  fetchConditionsText: vi.fn().mockResolvedValue("Tide flooding 2.1ft → 5.8ft\n48°F, clear skies"),
}));

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
    expect(body).toContain("https://kayakpolobellingham.com/games/game-123");

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

  // Auto email notifications are currently disabled (hardcoded early return).
  // When re-enabled, replace this test with the individual behavior tests below.
  it("returns auto_email_disabled while notifications are turned off", async () => {
    const result = await checkAndNotify(mockDb, "game-123", sendEmail);
    expect(result).toEqual({ sent: false, reason: "auto_email_disabled" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // TODO: Re-enable these tests when auto email notifications are turned back on
  // it("returns game_not_found when game doesn't exist", ...)
  // it("returns already_notified when game_on_notified is 1", ...)
  // it("returns below_threshold when fewer than 6 'in' signups", ...)
  // it("sends notification when threshold reached", ...)
  // it("does not mark as notified when send fails", ...)
  // it("sends with more than 6 signups (7+)", ...)
});
