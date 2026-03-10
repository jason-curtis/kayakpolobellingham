import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGroupsIoSender } from "./send-email";

describe("createGroupsIoSender", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates draft then posts it via groups.io API", async () => {
    // Step 1: newdraft returns a draft with id
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 42 }),
    });
    // Step 2: postdraft succeeds
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("{}"),
    });

    const sender = createGroupsIoSender("test-api-key");
    await sender("kayakpolobellingham@groups.io", "Sunday 8/3 game on!", "Game on body");

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Verify newdraft call
    const [draftUrl, draftOpts] = (globalThis.fetch as any).mock.calls[0];
    expect(draftUrl).toBe("https://groups.io/api/v1/newdraft");
    expect(draftOpts.method).toBe("POST");
    expect(draftOpts.headers.Authorization).toBe("Bearer test-api-key");
    const draftBody = new URLSearchParams(draftOpts.body);
    expect(draftBody.get("group_id")).toBe("14099");
    expect(draftBody.get("subject")).toBe("Sunday 8/3 game on!");
    expect(draftBody.get("body")).toBe("Game on body");

    // Verify postdraft call
    const [postUrl, postOpts] = (globalThis.fetch as any).mock.calls[1];
    expect(postUrl).toBe("https://groups.io/api/v1/postdraft");
    expect(postOpts.method).toBe("POST");
    expect(postOpts.headers.Authorization).toBe("Bearer test-api-key");
    const postBody = new URLSearchParams(postOpts.body);
    expect(postBody.get("draft_id")).toBe("42");
  });

  it("throws on newdraft failure", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io newdraft failed: 403 Forbidden"
    );
  });

  it("throws on postdraft failure", async () => {
    // newdraft succeeds
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 99 }),
    });
    // postdraft fails
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal error"),
    });

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io postdraft failed: 500 Internal error"
    );
  });
});
