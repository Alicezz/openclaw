import { describe, expect, it } from "vitest";
import { parseAbsoluteTimeMs } from "./parse.js";

describe("parseAbsoluteTimeMs", () => {
  it("parses ISO-8601 datetime strings", () => {
    const result = parseAbsoluteTimeMs("2026-01-12T18:00:00Z");
    expect(result).toBe(Date.parse("2026-01-12T18:00:00Z"));
  });

  it("parses ISO date-only strings as midnight UTC", () => {
    const result = parseAbsoluteTimeMs("2026-01-12");
    expect(result).toBe(Date.parse("2026-01-12T00:00:00Z"));
  });

  it("parses ISO datetime without timezone suffix as UTC", () => {
    const result = parseAbsoluteTimeMs("2026-01-12T18:00:00");
    expect(result).toBe(Date.parse("2026-01-12T18:00:00Z"));
  });

  describe("digit-width detection (seconds vs milliseconds)", () => {
    it("promotes 10-digit Unix-seconds strings to milliseconds (current era)", () => {
      // 1714000000 = April 25, 2024 in Unix seconds (10 digits)
      const result = parseAbsoluteTimeMs("1714000000");
      expect(result).toBe(1_714_000_000 * 1000);
      expect(new Date(result!).getUTCFullYear()).toBe(2024);
    });

    it("promotes 9-digit Unix-seconds strings to milliseconds", () => {
      // 999999999 = Sep 9, 2001 (9 digits)
      const result = parseAbsoluteTimeMs("999999999");
      expect(result).toBe(999_999_999 * 1000);
      expect(new Date(result!).getUTCFullYear()).toBe(2001);
    });

    it("treats 13-digit values as milliseconds without promotion", () => {
      // 1714000000000 = April 25, 2024 in milliseconds (13 digits)
      const result = parseAbsoluteTimeMs("1714000000000");
      expect(result).toBe(1_714_000_000_000);
      expect(new Date(result!).getUTCFullYear()).toBe(2024);
    });

    it("treats pre-2001 millisecond values correctly (reviewer counterexample)", () => {
      // 946684800000 = Jan 1, 2000 in milliseconds (12 digits)
      // The old threshold (1e12) would have misclassified this as seconds → year 31969.
      // The digit-width test correctly identifies 12 digits as milliseconds.
      const result = parseAbsoluteTimeMs("946684800000");
      expect(result).toBe(946_684_800_000);
      expect(new Date(result!).getUTCFullYear()).toBe(2000);
    });

    it("treats 11-digit millisecond values as milliseconds", () => {
      // 10000000000 = Nov 20, 1970 in ms — 11 digits, unambiguously ms
      const result = parseAbsoluteTimeMs("10000000000");
      expect(result).toBe(10_000_000_000);
    });

    it("treats 12-digit millisecond values as milliseconds", () => {
      const nowMs = Date.parse("2026-06-15T12:00:00Z"); // 13 digits
      const result = parseAbsoluteTimeMs(String(nowMs));
      expect(result).toBe(nowMs);
      expect(new Date(result!).getUTCFullYear()).toBe(2026);
    });

    it("falls through for 14+ digit values (implausible epoch)", () => {
      // 14-digit number is not a valid date string, so Date.parse returns NaN
      const result = parseAbsoluteTimeMs("12345678901234");
      expect(result).toBeNull();
    });
  });

  it("returns null for empty string", () => {
    expect(parseAbsoluteTimeMs("")).toBeNull();
    expect(parseAbsoluteTimeMs("  ")).toBeNull();
  });

  it("returns null for non-date strings", () => {
    expect(parseAbsoluteTimeMs("not-a-date")).toBeNull();
    expect(parseAbsoluteTimeMs("abc123")).toBeNull();
  });
});
