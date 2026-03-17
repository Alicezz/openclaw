import { describe, expect, test } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { deriveSessionTitle } from "./session-title.js";

describe("deriveSessionTitle", () => {
  test("returns undefined for undefined entry", () => {
    expect(deriveSessionTitle(undefined)).toBeUndefined();
  });

  test("prefers displayName when set", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "My Custom Session",
      subject: "Group Chat",
      label: "work",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("My Custom Session");
  });

  test("falls back to subject when displayName is missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      subject: "Dev Team Chat",
      label: "work",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Dev Team Chat");
  });

  test("falls back to label when displayName and subject are missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      label: "personal",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("personal");
  });

  test("falls back to origin.label when label is missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      origin: { label: "telegram-chat" },
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("telegram-chat");
  });

  test("uses first user message when displayName, subject, and labels are all missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    expect(deriveSessionTitle(entry, "Hello, how are you?")).toBe("Hello, how are you?");
  });

  test("truncates long first user message to 60 chars with ellipsis", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    const longMsg =
      "This is a very long message that exceeds sixty characters and should be truncated appropriately";
    const result = deriveSessionTitle(entry, longMsg);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(60);
    expect(result!.endsWith("…")).toBe(true);
  });

  test("truncates at word boundary when possible", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    const longMsg = "This message has many words and should be truncated at a word boundary nicely";
    const result = deriveSessionTitle(entry, longMsg);
    expect(result).toBeDefined();
    expect(result!.endsWith("…")).toBe(true);
    expect(result!.includes("  ")).toBe(false);
  });

  test("falls back to sessionId prefix with date", () => {
    const entry = {
      sessionId: "abcd1234-5678-90ef-ghij-klmnopqrstuv",
      updatedAt: new Date("2024-03-15T10:30:00Z").getTime(),
    } as SessionEntry;
    const result = deriveSessionTitle(entry);
    expect(result).toBe("abcd1234 (2024-03-15)");
  });

  test("falls back to sessionId prefix without date when updatedAt missing", () => {
    const entry = {
      sessionId: "abcd1234-5678-90ef-ghij-klmnopqrstuv",
      updatedAt: 0,
    } as SessionEntry;
    const result = deriveSessionTitle(entry);
    expect(result).toBe("abcd1234");
  });

  test("trims whitespace from displayName", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "  Padded Name  ",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Padded Name");
  });

  test("ignores empty displayName and falls through", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "   ",
      subject: "Actual Subject",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Actual Subject");
  });

  test("ignores empty label and falls through", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      label: "   ",
      origin: { label: "origin-label" },
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("origin-label");
  });

  test("ignores empty origin.label and falls through to firstUserMessage", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      origin: { label: "   " },
    } as SessionEntry;
    expect(deriveSessionTitle(entry, "First message")).toBe("First message");
  });

  test("label takes precedence over firstUserMessage", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      label: "labeled-session",
    } as SessionEntry;
    expect(deriveSessionTitle(entry, "Hello there")).toBe("labeled-session");
  });

  test("origin.label takes precedence over firstUserMessage", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      origin: { label: "origin-labeled" },
    } as SessionEntry;
    expect(deriveSessionTitle(entry, "Hello there")).toBe("origin-labeled");
  });
});
