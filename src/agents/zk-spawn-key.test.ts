import { afterEach, describe, expect, it } from "vitest";
import { resetZkSpawnKeyForTest, resolveZkSpawnKey } from "./zk-spawn-key.js";

describe("resolveZkSpawnKey", () => {
  afterEach(() => {
    resetZkSpawnKeyForTest();
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.CLAWDBOT_GATEWAY_TOKEN;
  });

  it("returns a 32-byte Buffer", () => {
    const key = resolveZkSpawnKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("returns the same key on repeated calls (cached)", () => {
    const k1 = resolveZkSpawnKey();
    const k2 = resolveZkSpawnKey();
    expect(k1.equals(k2)).toBe(true);
  });

  it("produces a deterministic key from OPENCLAW_GATEWAY_TOKEN", () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = "test-token-abc";
    const k1 = resolveZkSpawnKey();
    resetZkSpawnKeyForTest();
    process.env.OPENCLAW_GATEWAY_TOKEN = "test-token-abc";
    const k2 = resolveZkSpawnKey();
    expect(k1.equals(k2)).toBe(true);
  });

  it("produces different keys for different tokens", () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = "token-A";
    const k1 = resolveZkSpawnKey();
    resetZkSpawnKeyForTest();
    process.env.OPENCLAW_GATEWAY_TOKEN = "token-B";
    const k2 = resolveZkSpawnKey();
    expect(k1.equals(k2)).toBe(false);
  });

  it("falls back to CLAWDBOT_GATEWAY_TOKEN when OPENCLAW_GATEWAY_TOKEN is absent", () => {
    process.env.CLAWDBOT_GATEWAY_TOKEN = "clawdbot-secret";
    const k1 = resolveZkSpawnKey();
    resetZkSpawnKeyForTest();
    process.env.CLAWDBOT_GATEWAY_TOKEN = "clawdbot-secret";
    const k2 = resolveZkSpawnKey();
    expect(k1.equals(k2)).toBe(true);
  });

  it("uses a random seed when no token env var is set", () => {
    const k1 = resolveZkSpawnKey();
    resetZkSpawnKeyForTest();
    const k2 = resolveZkSpawnKey();
    // Two calls without a token produce different random seeds.
    expect(k1.equals(k2)).toBe(false);
  });
});
