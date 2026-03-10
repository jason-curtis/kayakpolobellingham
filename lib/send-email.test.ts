import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGroupsIoSender } from "./send-email";

function mockOkJson(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) };
}

function mockOk() {
  return { ok: true, text: () => Promise.resolve("{}") };
}

function mockError(status: number, body: string) {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

describe("createGroupsIoSender", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates draft, updates it, then posts via groups.io API", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(mockOkJson({ id: 42 }))  // newdraft
      .mockResolvedValueOnce(mockOk())                  // updatedraft
      .mockResolvedValueOnce(mockOk());                  // postdraft

    const sender = createGroupsIoSender("test-api-key");
    await sender("kayakpolobellingham@groups.io", "Sunday 8/3 game on!", "Game on body");

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    // newdraft: creates empty draft
    const [draftUrl, draftOpts] = (globalThis.fetch as any).mock.calls[0];
    expect(draftUrl).toBe("https://groups.io/api/v1/newdraft");
    const draftBody = new URLSearchParams(draftOpts.body);
    expect(draftBody.get("group_id")).toBe("14099");
    expect(draftBody.get("draft_type")).toBe("draft_type_post");

    // updatedraft: sets subject and body
    const [updateUrl, updateOpts] = (globalThis.fetch as any).mock.calls[1];
    expect(updateUrl).toBe("https://groups.io/api/v1/updatedraft");
    const updateBody = new URLSearchParams(updateOpts.body);
    expect(updateBody.get("draft_id")).toBe("42");
    expect(updateBody.get("subject")).toBe("Sunday 8/3 game on!");
    expect(updateBody.get("body")).toBe("Game on body");

    // postdraft: publishes
    const [postUrl, postOpts] = (globalThis.fetch as any).mock.calls[2];
    expect(postUrl).toBe("https://groups.io/api/v1/postdraft");
    const postBody = new URLSearchParams(postOpts.body);
    expect(postBody.get("draft_id")).toBe("42");
  });

  it("throws on newdraft failure", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(mockError(403, "Forbidden"));

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io newdraft failed: 403 Forbidden"
    );
  });

  it("throws on updatedraft failure", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(mockOkJson({ id: 99 }))
      .mockResolvedValueOnce(mockError(400, "bad subject"));

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io updatedraft failed: 400 bad subject"
    );
  });

  it("throws on postdraft failure", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(mockOkJson({ id: 99 }))
      .mockResolvedValueOnce(mockOk())
      .mockResolvedValueOnce(mockError(500, "Internal error"));

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io postdraft failed: 500 Internal error"
    );
  });
});
