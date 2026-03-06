import { describe, it, expect } from "vitest";
import {
  resolveName,
  resolveSender,
  extractSenderName,
  stripQuotedText,
  parseSignupsFromMessage,
  extractGameDate,
  isGameTopic,
  parseDateFromTitle,
  parseRosterFromGameOn,
  isBadName,
  parseInboundEmail,
  aggregateTopicsIntoGames,
  type Topic,
} from "./email-parser";

describe("resolveName", () => {
  it("resolves aliases and SENDER_MAP", () => {
    expect(resolveName("dor")).toBe("Dorothy");
    expect(resolveName("gs")).toBe("Gary");
    expect(resolveName("Dorothy Burke")).toBe("Dorothy");
    expect(resolveName("bubbles")).toBe("Jason");
  });
  it("title-cases unknown names", () => {
    expect(resolveName("newbie")).toBe("Newbie");
  });
});

describe("resolveSender", () => {
  it("uses SENDER_MAP then resolveName", () => {
    expect(resolveSender("Jason Curtis")).toBe("Jason");
    expect(resolveSender("random")).toBe("Random");
  });
});

describe("extractSenderName", () => {
  it("extracts from From header formats", () => {
    expect(extractSenderName('"Gary Smith" <gary@example.com>')).toBe("Gary Smith");
    expect(extractSenderName("Gary Smith <gary@example.com>")).toBe("Gary Smith");
    expect(extractSenderName("gary@example.com")).toBe("gary");
  });
});

describe("stripQuotedText", () => {
  it("stops at forwarded/original message", () => {
    const body = "I'm in\n\n----- Original Message -----\nFrom: other";
    expect(stripQuotedText(body)).toBe("I'm in\n");
  });
  it("stops at On ... wrote:", () => {
    expect(stripQuotedText("yes\n\nOn Mon, Bob wrote:\n>")).toBe("yes\n");
  });
});

describe("parseSignupsFromMessage", () => {
  it("parses I'm in / I'm out with sender", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("I'm in", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "in" }]);
    expect(parseSignupsFromMessage("I'm out", "Dorothy Burke", withAliases)).toEqual([{ name: "Dorothy", status: "out" }]);
  });
  it("parses Name in / Name out with batch resolvers", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("dor in", "x", withAliases)).toEqual([{ name: "Dorothy", status: "in" }]);
    expect(parseSignupsFromMessage("gary out", "x", withAliases)).toEqual([{ name: "Gary", status: "out" }]);
  });
  it("parses Dor and Gary in", () => {
    const withAliases = { resolveName, resolveSender };
    const got = parseSignupsFromMessage("Dor and Gary in", "x", withAliases);
    expect(got).toHaveLength(2);
    expect(got.map((s) => s.name).sort()).toEqual(["Dorothy", "Gary"]);
    expect(got.every((s) => s.status === "in")).toBe(true);
  });
  it("parses short in/out as sender", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("in", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "in" }]);
    expect(parseSignupsFromMessage("out", "Dorothy Burke", withAliases)).toEqual([{ name: "Dorothy", status: "out" }]);
  });
  it("uses titleCase when no resolvers (real-time path)", () => {
    const got = parseSignupsFromMessage("Dor in", "Bob");
    expect(got).toEqual([{ name: "Dor", status: "in" }]);
  });
});

describe("extractGameDate", () => {
  it("parses M/D/YY and M/D from subject", () => {
    expect(extractGameDate("Sunday 3/2/26")).toMatch(/2026-03-02/);
    expect(extractGameDate("Game 8/27")).toMatch(/^\d{4}-08-27$/);
  });
  it("parses month name", () => {
    expect(extractGameDate("Jan 4, 2025")).toBe("2025-01-04");
  });
  it("uses referenceDate year when year is missing (month name)", () => {
    expect(extractGameDate("Sunday March 1", "2009-02-25T00:00:00Z")).toBe("2009-03-01");
  });
  it("uses referenceDate year when year is missing (M/D)", () => {
    expect(extractGameDate("Sunday 3/1", "2009-02-25T00:00:00Z")).toBe("2009-03-01");
  });
  it("advances past date to next occurrence of named day", () => {
    // 3/1/26 is a Sunday but it's before refDate 3/5, so advance to next Sunday 3/8
    expect(extractGameDate("Sunday 3/1/26 post in our out", "2026-03-05T00:00:00Z")).toBe("2026-03-08");
  });
  it("does not advance future dates", () => {
    expect(extractGameDate("Sunday 3/8", "2026-03-05T00:00:00Z")).toBe("2026-03-08");
  });
  it("behaves as before with no referenceDate", () => {
    expect(extractGameDate("Sunday 3/1/26")).toBe("2026-03-01");
  });
});

describe("isGameTopic", () => {
  it("returns true for game-like subjects", () => {
    expect(isGameTopic("Post in or out for Sunday 3/2")).toBe(true);
    expect(isGameTopic("Game on!")).toBe(true);
    expect(isGameTopic("No game this week")).toBe(true);
  });
  it("returns false for unrelated", () => {
    expect(isGameTopic("Random chat")).toBe(false);
  });
});

describe("parseDateFromTitle", () => {
  it("parses M/D/YY with ref year from first message", () => {
    expect(parseDateFromTitle("Sunday 3/2/26", "2026-01-01")).toBe("2026-03-02");
  });
  it("parses ordinal like Sunday 19th when ref date given", () => {
    expect(parseDateFromTitle("Sunday the 19th", "2025-01-15")).toBe("2025-01-19");
  });
  it("returns null when no date in title", () => {
    expect(parseDateFromTitle("Random topic")).toBeNull();
  });
});

describe("parseRosterFromGameOn", () => {
  it("extracts comma-separated names and resolves them", () => {
    const got = parseRosterFromGameOn("Game On: Dor, Gary, Dave, Paul");
    expect(got).toContain("Dorothy");
    expect(got).toContain("Gary");
    expect(got).toContain("Dave");
    expect(got).toContain("Paul");
  });
});

describe("isBadName", () => {
  it("filters known false positives", () => {
    expect(isBadName("I'm")).toBe(true);
    expect(isBadName("Dorothy")).toBe(false);
  });
});

describe("parseInboundEmail", () => {
  it("returns senderName, signups, gameDate, isGameTopic from single email", () => {
    const result = parseInboundEmail({
      from: "Gary Smith <gary@example.com>",
      subject: "Sunday 3/2/26 - post in or out",
      textBody: "I'm in",
    });
    expect(result.senderName).toBe("Gary Smith");
    expect(result.signups).toEqual([{ name: "Gary Smith", status: "in" }]);
    expect(result.gameDate).toMatch(/2026-03-02/);
    expect(result.isGameTopic).toBe(true);
  });
  it("returns empty signups and no gameDate for non-game subject", () => {
    const result = parseInboundEmail({
      from: "x@y.com",
      subject: "Unrelated",
      textBody: "Hello",
    });
    expect(result.signups).toEqual([]);
    expect(result.gameDate).toBeNull();
    expect(result.isGameTopic).toBe(false);
  });
});

describe("aggregateTopicsIntoGames", () => {
  it("aggregates one topic with one message into one game", () => {
    const topics: Topic[] = [
      {
        topicId: "t1",
        title: "Sunday 3/1/26 post in or out",
        url: "https://example.com/t1",
        messages: [
          { sender: "Jason Curtis", date: "2026-02-28", body: "I'm in" },
        ],
      },
    ];
    const games = aggregateTopicsIntoGames(topics);
    expect(games).toHaveLength(1);
    expect(games[0].date).toBe("2026-03-01");
    expect(games[0].dayOfWeek).toBe("Sunday");
    expect(games[0].players).toEqual([{ name: "Jason", status: "in" }]);
  });
  it("skips topics with no parseable date", () => {
    const games = aggregateTopicsIntoGames([
      { topicId: "t1", title: "No date here", url: "", messages: [{ sender: "X", date: "", body: "in" }] },
    ]);
    expect(games).toHaveLength(0);
  });
});
