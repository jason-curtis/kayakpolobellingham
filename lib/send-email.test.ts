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

  it("sends POST to groups.io API with correct params", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("{}"),
    });

    const sender = createGroupsIoSender("test-api-key");
    await sender("kayakpolobellingham@groups.io", "Sunday 8/3 game on!", "Game on body");

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe("https://groups.io/api/v1/sendmessage");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-api-key");

    const body = new URLSearchParams(opts.body);
    expect(body.get("group_id")).toBe("14099");
    expect(body.get("subject")).toBe("Sunday 8/3 game on!");
    expect(body.get("body")).toBe("Game on body");
  });

  it("throws on non-ok response", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    const sender = createGroupsIoSender("test-api-key");
    await expect(sender("to@test.com", "Subject", "Body")).rejects.toThrow(
      "groups.io sendmessage failed: 403 Forbidden"
    );
  });
});
