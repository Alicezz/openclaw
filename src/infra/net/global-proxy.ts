import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  hasProxyEnvConfigured,
  PROXY_ENV_KEYS,
  resolveAllProxyFallbackOptions,
} from "./proxy-env.js";

const log = createSubsystemLogger("net/global-proxy");

/**
 * One-shot latch: `applyGlobalProxyDispatcher` runs once at gateway startup
 * (after dotenv loading). It is NOT re-entrant after config reload — proxy
 * env changes require a full gateway restart.
 */
let applied = false;

/**
 * When HTTP_PROXY / HTTPS_PROXY / ALL_PROXY environment variables are set,
 * replace the default undici global dispatcher with an EnvHttpProxyAgent so
 * that **all** `globalThis.fetch` calls (including LLM inference via
 * `@mariozechner/pi-ai`) honour the proxy configuration.
 *
 * This is safe to call multiple times; only the first invocation takes effect.
 * If no proxy env var is detected the function is a no-op.
 */
export function applyGlobalProxyDispatcher(): void {
  if (applied) {
    return;
  }

  if (!hasProxyEnvConfigured()) {
    return;
  }

  // If another module (e.g. Telegram) already installed a proxy-aware
  // dispatcher we leave it alone.
  const existing = getGlobalDispatcher();
  const ctorName = (existing as { constructor?: { name?: string } })?.constructor?.name;
  if (typeof ctorName === "string" && ctorName.includes("ProxyAgent")) {
    log.info("proxy-aware global dispatcher already present, skipping");
    applied = true;
    return;
  }

  try {
    const fallbackOptions = resolveAllProxyFallbackOptions();
    const agentOptions = fallbackOptions ?? {};

    // Warn when a SOCKS URL was rewritten — pure-SOCKS endpoints (e.g.
    // ssh -D tunnels) will fail at connect time with an opaque error.
    if (fallbackOptions) {
      const rawAllProxy = process.env.all_proxy?.trim() || process.env.ALL_PROXY?.trim() || "";
      if (rawAllProxy && fallbackOptions.httpsProxy && fallbackOptions.httpsProxy !== rawAllProxy) {
        log.warn(
          `ALL_PROXY "${rawAllProxy}" rewritten to "${fallbackOptions.httpsProxy}" for undici compatibility — if your proxy only supports SOCKS, LLM requests will fail`,
        );
      }
    }

    setGlobalDispatcher(new EnvHttpProxyAgent(agentOptions));
    applied = true;
    const active = PROXY_ENV_KEYS.find((k) => process.env[k]?.trim());
    log.info(`global undici dispatcher set to EnvHttpProxyAgent (via ${active})`);
  } catch (err) {
    log.warn(`failed to set global proxy dispatcher: ${String(err)}`);
  }
}

/** Reset state for tests. */
export function resetGlobalProxyStateForTests(): void {
  applied = false;
}
