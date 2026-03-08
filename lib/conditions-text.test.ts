import { describe, it, expect } from "vitest";
import { degreesToCompass } from "./conditions-text";

describe("degreesToCompass", () => {
  it("converts 0° to N", () => {
    expect(degreesToCompass(0)).toBe("N");
  });

  it("converts 360° to N", () => {
    expect(degreesToCompass(360)).toBe("N");
  });

  it("converts 45° to NE", () => {
    expect(degreesToCompass(45)).toBe("NE");
  });

  it("converts 90° to E", () => {
    expect(degreesToCompass(90)).toBe("E");
  });

  it("converts 180° to S", () => {
    expect(degreesToCompass(180)).toBe("S");
  });

  it("converts 270° to W", () => {
    expect(degreesToCompass(270)).toBe("W");
  });

  it("converts 315° to NW", () => {
    expect(degreesToCompass(315)).toBe("NW");
  });

  it("converts 22° to NNE", () => {
    expect(degreesToCompass(22)).toBe("NNE");
  });

  it("converts 200° to SSW", () => {
    expect(degreesToCompass(200)).toBe("SSW");
  });

  it("handles negative degrees", () => {
    expect(degreesToCompass(-90)).toBe("W");
  });
});
