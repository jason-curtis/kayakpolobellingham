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
  parseGameMessage,
  aggregateTopicsIntoGames,
  isMidweekDate,
  getGameTime,
  type Topic,
} from "./email-parser";

describe("resolveName", () => {
  it("resolves aliases and full names", () => {
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
  it("resolves sender names via aliases", () => {
    expect(resolveSender("Jason Curtis")).toBe("Jason");
    expect(resolveSender("bflannelly50")).toBe("Brian");
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
  it("stops at multi-line Gmail quoted reply", () => {
    const body = "Maybe\n\nOn Sat, Mar 7, 2026, 07:48 Dorothy Burke via groups.io <dorothy_burke=\ncomcast.net@groups.io> wrote:\n> I'm in";
    expect(stripQuotedText(body)).toBe("Maybe");
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
  it("parses maybe status from body", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("maybe", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "maybe" }]);
    expect(parseSignupsFromMessage("I might make it", "Dorothy Burke", withAliases)).toEqual([{ name: "Dorothy", status: "maybe" }]);
    expect(parseSignupsFromMessage("depends on work", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "maybe" }]);
  });
  it("does not false-positive 'might' in non-signup context", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage(
      "Gary says show up at the alley behind 509 Cowgill at 8:40. It might be difficult to keep you warm.",
      "Dorothy Burke", withAliases
    )).toEqual([]);
  });
  it("parses Name maybe", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("gary maybe", "x", withAliases)).toEqual([{ name: "Gary", status: "maybe" }]);
  });
  it("parses 'Name is out' with linking verb", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("Dor is out", "x", withAliases)).toEqual([{ name: "Dorothy", status: "out" }]);
    expect(parseSignupsFromMessage("Gary is in", "x", withAliases)).toEqual([{ name: "Gary", status: "in" }]);
  });
  it("parses 'I can make/do [time]' as in", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("I can do 5:30", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "in" }]);
    expect(parseSignupsFromMessage("I can make it", "Dorothy Burke", withAliases)).toEqual([{ name: "Dorothy", status: "in" }]);
    expect(parseSignupsFromMessage("I can also make it for 5:30", "Jason Curtis", withAliases)).toEqual([{ name: "Jason", status: "in" }]);
  });
  it("parses 'Name can make [time]' as in", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("Glenn can make 5:30", "x", withAliases)).toEqual([{ name: "Glenn", status: "in" }]);
    expect(parseSignupsFromMessage("Paul can make it for 2 or 3 weeks at 530", "x", withAliases)).toEqual([{ name: "Paul", status: "in" }]);
  });
  it("parses 'should work for me' as in", () => {
    const withAliases = { resolveName, resolveSender };
    expect(parseSignupsFromMessage("5:30 should work for me", "Mark Lisowski", withAliases)).toEqual([{ name: "Mark", status: "in" }]);
  });
});

describe("isMidweekDate", () => {
  it("returns true for Mon-Fri", () => {
    expect(isMidweekDate("2026-03-09")).toBe(true);  // Monday
    expect(isMidweekDate("2026-03-11")).toBe(true);  // Wednesday
    expect(isMidweekDate("2026-03-13")).toBe(true);  // Friday
  });
  it("returns false for Sat/Sun", () => {
    expect(isMidweekDate("2026-03-07")).toBe(false); // Saturday
    expect(isMidweekDate("2026-03-08")).toBe(false); // Sunday
  });
});

describe("getGameTime", () => {
  it("returns 09:00 for weekend dates", () => {
    expect(getGameTime("2026-03-08")).toBe("09:00"); // Sunday
    expect(getGameTime("2026-03-07")).toBe("09:00"); // Saturday
  });
  it("returns 17:30 for first 3 midweek games of the year", () => {
    expect(getGameTime("2026-01-07", 0)).toBe("17:30"); // 1st
    expect(getGameTime("2026-01-14", 1)).toBe("17:30"); // 2nd
    expect(getGameTime("2026-01-21", 2)).toBe("17:30"); // 3rd
  });
  it("returns 18:00 for 4th+ midweek games", () => {
    expect(getGameTime("2026-01-28", 3)).toBe("18:00"); // 4th
    expect(getGameTime("2026-02-04", 4)).toBe("18:00"); // 5th
  });
  it("defaults to 18:00 when count not provided", () => {
    expect(getGameTime("2026-03-11")).toBe("18:00"); // Wednesday, no count = safe default
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
  it("parses day name + ordinal like 'Wednesday the 11th'", () => {
    const result = extractGameDate("Next Wednesday the 11th");
    expect(result).toMatch(/^\d{4}-\d{2}-11$/);
  });
  it("parses 'Sunday the 5th'", () => {
    const result = extractGameDate("Sunday the 5th");
    expect(result).toMatch(/^\d{4}-\d{2}-05$/);
  });
  it("extracts date from day-name-only subject with reference date", () => {
    // "2026 Wednesday Night Season Opener" posted on Wed March 4 → next Wed = March 11
    expect(extractGameDate("2026 Wednesday Night Season Opener", "2026-03-04T16:48:23")).toBe("2026-03-11");
  });
  it("extracts date from day-name-only subject (Sunday)", () => {
    // Subject just says "Sunday" posted on Thursday March 5 → next Sunday = March 8
    expect(extractGameDate("Sunday polo game", "2026-03-05T10:00:00")).toBe("2026-03-08");
  });
  it("day-name-only returns null without reference date", () => {
    // Without reference date we can't compute which week, so return null
    expect(extractGameDate("Wednesday Night Season Opener")).toBeNull();
  });
  it("day-name-only handles abbreviated day names", () => {
    expect(extractGameDate("Weds night game", "2026-03-04T10:00:00")).toBe("2026-03-11");
  });
  it("handles 'Game On Polo 5:30 Wednesday Season Opener'", () => {
    // Posted Saturday March 8 → next Wednesday = March 11
    expect(extractGameDate("Game On Polo 5:30 Wednesday Season Opener", "2026-03-08T21:48:55")).toBe("2026-03-11");
  });
});

describe("isGameTopic", () => {
  it("returns true for game-like subjects", () => {
    expect(isGameTopic("Post in or out for Sunday 3/2")).toBe(true);
    expect(isGameTopic("Game on!")).toBe(true);
    expect(isGameTopic("No game this week")).toBe(true);
  });
  it("returns true for day + ordinal subjects", () => {
    expect(isGameTopic("Next Wednesday the 11th")).toBe(true);
    expect(isGameTopic("Sunday the 5th game")).toBe(true);
  });
  it("returns true for season opener", () => {
    expect(isGameTopic("2026 Wednesday Night Season Opener")).toBe(true);
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

describe("parseGameMessage", () => {
  it("returns senderName, signups, gameDate, isGameTopic from single email", async () => {
    const result = await parseGameMessage({
      subject: "Sunday 3/2/26 - post in or out",
      body: "I'm in",
      senderName: "Gary Smith",
    });
    expect(result.senderName).toBe("Gary smith");
    expect(result.signups).toEqual([{ name: "Gary smith", status: "in" }]);
    expect(result.gameDate).toMatch(/2026-03-02/);
    expect(result.isGameTopic).toBe(true);
  });
  it("returns empty signups and no gameDate for non-game subject", async () => {
    const result = await parseGameMessage({
      subject: "Unrelated",
      body: "Hello",
      senderName: "x",
    });
    expect(result.signups).toEqual([]);
    expect(result.gameDate).toBeNull();
    expect(result.isGameTopic).toBe(false);
  });
  it("extracts date from day-name-only subject via reference date", async () => {
    const result = await parseGameMessage({
      subject: "2026 Wednesday Night Season Opener",
      body: "I'm in",
      senderName: "Jason Curtis",
      referenceDate: "2026-03-04T16:48:23",
    });
    expect(result.gameDate).toBe("2026-03-11");
    expect(result.isGameTopic).toBe(true);
    expect(result.signups).toEqual([{ name: "Jason", status: "in" }]);
  });
  it("falls back to body for date extraction when subject has none", async () => {
    const result = await parseGameMessage({
      subject: "Season Opener",
      body: "Posting for next Wednesday the 11th\nI'm in",
      senderName: "gsouthstone",
      referenceDate: "2026-03-04T16:48:23",
    });
    expect(result.gameDate).toBe("2026-03-11");
    expect(result.signups).toEqual([{ name: "Gary", status: "in" }]);
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
