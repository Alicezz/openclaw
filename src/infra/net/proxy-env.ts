export const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;

export function hasProxyEnvConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return true;
    }
  }
  return false;
}

function normalizeProxyEnvValue(value: string | undefined): string | null | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Match undici EnvHttpProxyAgent semantics for env-based HTTP/S proxy selection:
 * - lower-case vars take precedence over upper-case
 * - HTTPS requests prefer https_proxy/HTTPS_PROXY, then fall back to http_proxy/HTTP_PROXY
 * - ALL_PROXY is ignored by EnvHttpProxyAgent
 */
export function resolveEnvHttpProxyUrl(
  protocol: "http" | "https",
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const lowerHttpProxy = normalizeProxyEnvValue(env.http_proxy);
  const lowerHttpsProxy = normalizeProxyEnvValue(env.https_proxy);
  const httpProxy =
    lowerHttpProxy !== undefined ? lowerHttpProxy : normalizeProxyEnvValue(env.HTTP_PROXY);
  const httpsProxy =
    lowerHttpsProxy !== undefined ? lowerHttpsProxy : normalizeProxyEnvValue(env.HTTPS_PROXY);
  if (protocol === "https") {
    return httpsProxy ?? httpProxy ?? undefined;
  }
  return httpProxy ?? undefined;
}

export function hasEnvHttpProxyConfigured(
  protocol: "http" | "https" = "https",
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveEnvHttpProxyUrl(protocol, env) !== undefined;
}

const SOCKS_PROTOCOL_RE = /^socks(?:4|5h?)?:\/\//i;

/**
 * Rewrite proxy URLs whose protocol is unsupported by undici's
 * EnvHttpProxyAgent (which only accepts http:// and https://).
 *
 * SOCKS5 URLs are rewritten to http:// on the same host:port because most
 * local proxy tools (Clash, V2Ray, Shadowsocks) accept HTTP CONNECT on the
 * same listener. For truly SOCKS-only endpoints this will fail at connect
 * time, which is still better than silently going direct.
 *
 * Returns `null` for protocols that cannot be meaningfully rewritten.
 */
function normalizeProxyUrlForUndici(url: string): string | null {
  // Fast path: already http(s).
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  // Rewrite socks4/5/5h to http on the same host:port.
  if (SOCKS_PROTOCOL_RE.test(url)) {
    return url.replace(SOCKS_PROTOCOL_RE, "http://");
  }
  // Unknown protocol — cannot meaningfully rewrite.
  return null;
}

/**
 * Return explicit `httpProxy` / `httpsProxy` options for `EnvHttpProxyAgent`
 * when the environment proxy URLs need normalization or bridging.
 *
 * Covers two cases:
 * 1. HTTP_PROXY / HTTPS_PROXY contain a protocol that `EnvHttpProxyAgent`
 *    cannot handle (e.g. `socks5://`) — normalize to `http://`.
 * 2. Only ALL_PROXY (or `all_proxy`) is set — `EnvHttpProxyAgent` ignores
 *    ALL_PROXY entirely, so we pass its (normalized) value explicitly.
 *
 * Returns `undefined` when no explicit options are needed (standard vars
 * are set with `http://` / `https://` URLs that the agent handles natively).
 */
export function resolveAllProxyFallbackOptions(
  env: NodeJS.ProcessEnv = process.env,
): { httpProxy: string; httpsProxy: string } | undefined {
  const httpUrl = resolveEnvHttpProxyUrl("http", env);
  const httpsUrl = resolveEnvHttpProxyUrl("https", env);

  // If standard vars are set with http(s):// URLs, EnvHttpProxyAgent handles
  // them natively — no explicit options needed. But ALL non-null URLs must be
  // usable; a mix like HTTP_PROXY=http://… + HTTPS_PROXY=socks5://… would
  // still break the agent for https requests.
  const httpOk = httpUrl == null || /^https?:\/\//i.test(httpUrl);
  const httpsOk = httpsUrl == null || /^https?:\/\//i.test(httpsUrl);
  const hasStandard = httpUrl != null || httpsUrl != null;

  if (hasStandard && httpOk && httpsOk) {
    return undefined;
  }

  // Standard vars exist but at least one uses an incompatible protocol
  // (e.g. socks5://). Normalize each individually, keeping usable ones as-is.
  if (hasStandard) {
    const effectiveHttpUrl = httpUrl ? normalizeProxyUrlForUndici(httpUrl) : null;
    const effectiveHttpsUrl = httpsUrl ? normalizeProxyUrlForUndici(httpsUrl) : null;
    const resolved = effectiveHttpsUrl ?? effectiveHttpUrl;
    if (resolved) {
      return {
        httpProxy: effectiveHttpUrl ?? resolved,
        httpsProxy: effectiveHttpsUrl ?? resolved,
      };
    }
  }

  // Fall back to ALL_PROXY / all_proxy.
  const lowerAllProxy = normalizeProxyEnvValue(env.all_proxy);
  const allProxy =
    lowerAllProxy !== undefined ? lowerAllProxy : normalizeProxyEnvValue(env.ALL_PROXY);
  if (!allProxy) {
    return undefined;
  }

  const proxyUrl = normalizeProxyUrlForUndici(allProxy);
  if (!proxyUrl) {
    return undefined;
  }

  return { httpProxy: proxyUrl, httpsProxy: proxyUrl };
}
