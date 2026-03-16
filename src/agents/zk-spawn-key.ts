import { hkdfSync, randomBytes } from "node:crypto";

let _cachedKey: Buffer | null = null;

/**
 * Derives a 32-byte key used to sign and verify ZK handoff capsules exchanged
 * between subagent-spawn (sender) and the gateway agent handler (receiver).
 *
 * Key material: OPENCLAW_GATEWAY_TOKEN (or CLAWDBOT_GATEWAY_TOKEN) env var,
 * expanded via HKDF-SHA256 so the raw token is never used directly.
 *
 * If neither env var is set (e.g. in tests), a random per-process seed is used —
 * capsules will verify within the same process but not across process boundaries.
 */
export function resolveZkSpawnKey(): Buffer {
  if (_cachedKey) {
    return _cachedKey;
  }
  const tokenRaw = process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.CLAWDBOT_GATEWAY_TOKEN ?? "";
  const ikm = tokenRaw.trim().length > 0 ? Buffer.from(tokenRaw.trim(), "utf8") : randomBytes(32);
  const salt = Buffer.from("openclaw-zk-handoff-v1", "utf8");
  const info = Buffer.from("subagent-spawn", "utf8");
  _cachedKey = Buffer.from(hkdfSync("sha256", ikm, salt, info, 32));
  return _cachedKey;
}

/** Reset the cached key — for use in tests only. */
export function resetZkSpawnKeyForTest(): void {
  _cachedKey = null;
}
