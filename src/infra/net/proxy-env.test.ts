import { describe, expect, it } from "vitest";
import {
  hasEnvHttpProxyConfigured,
  hasProxyEnvConfigured,
  resolveAllProxyFallbackOptions,
  resolveEnvHttpProxyUrl,
} from "./proxy-env.js";

describe("hasProxyEnvConfigured", () => {
  it.each([
    {
      name: "detects upper-case HTTP proxy values",
      env: { HTTP_PROXY: "http://upper-http.test:8080" } as NodeJS.ProcessEnv,
      expected: true,
    },
    {
      name: "detects lower-case all_proxy values",
      env: { all_proxy: "socks5://proxy.test:1080" } as NodeJS.ProcessEnv,
      expected: true,
    },
    {
      name: "ignores blank proxy values",
      env: { HTTP_PROXY: "   ", all_proxy: "" } as NodeJS.ProcessEnv,
      expected: false,
    },
  ])("$name", ({ env, expected }) => {
    expect(hasProxyEnvConfigured(env)).toBe(expected);
  });
});

describe("resolveEnvHttpProxyUrl", () => {
  it("uses lower-case https_proxy before upper-case HTTPS_PROXY", () => {
    const env = {
      https_proxy: "http://lower.test:8080",
      HTTPS_PROXY: "http://upper.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("https", env)).toBe("http://lower.test:8080");
  });

  it("treats empty lower-case https_proxy as authoritative over upper-case HTTPS_PROXY", () => {
    const env = {
      https_proxy: "",
      HTTPS_PROXY: "http://upper.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("https", env)).toBeUndefined();
    expect(hasEnvHttpProxyConfigured("https", env)).toBe(false);
  });

  it("treats empty lower-case http_proxy as authoritative over upper-case HTTP_PROXY", () => {
    const env = {
      http_proxy: "   ",
      HTTP_PROXY: "http://upper-http.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("http", env)).toBeUndefined();
    expect(hasEnvHttpProxyConfigured("http", env)).toBe(false);
  });

  it("falls back from HTTPS proxy vars to HTTP proxy vars for https requests", () => {
    const env = {
      HTTP_PROXY: "http://upper-http.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("https", env)).toBe("http://upper-http.test:8080");
    expect(hasEnvHttpProxyConfigured("https", env)).toBe(true);
  });

  it("does not use ALL_PROXY for EnvHttpProxyAgent-style resolution", () => {
    const env = {
      ALL_PROXY: "http://all-proxy.test:8080",
      all_proxy: "http://lower-all-proxy.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("https", env)).toBeUndefined();
    expect(resolveEnvHttpProxyUrl("http", env)).toBeUndefined();
    expect(hasEnvHttpProxyConfigured("https", env)).toBe(false);
  });

  it("returns only HTTP proxies for http requests", () => {
    const env = {
      https_proxy: "http://lower-https.test:8080",
      http_proxy: "http://lower-http.test:8080",
    } as NodeJS.ProcessEnv;

    expect(resolveEnvHttpProxyUrl("http", env)).toBe("http://lower-http.test:8080");
  });
});

describe("resolveAllProxyFallbackOptions", () => {
  it("returns undefined when no proxy vars are set", () => {
    expect(resolveAllProxyFallbackOptions({})).toBeUndefined();
  });

  it("returns undefined when HTTP_PROXY is a usable http:// URL", () => {
    const env = { HTTP_PROXY: "http://127.0.0.1:7897" } as NodeJS.ProcessEnv;
    expect(resolveAllProxyFallbackOptions(env)).toBeUndefined();
  });

  it("returns undefined when HTTPS_PROXY is a usable https:// URL", () => {
    const env = { HTTPS_PROXY: "https://127.0.0.1:7897" } as NodeJS.ProcessEnv;
    expect(resolveAllProxyFallbackOptions(env)).toBeUndefined();
  });

  it("normalizes socks5:// HTTP_PROXY — sets both since HTTPS falls back to HTTP", () => {
    // resolveEnvHttpProxyUrl("https") falls back to HTTP_PROXY when HTTPS_PROXY
    // is not set, so both httpUrl and httpsUrl resolve to the socks5:// value
    // and both need normalization.
    const env = { HTTP_PROXY: "socks5://127.0.0.1:7897" } as NodeJS.ProcessEnv;
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({
      httpProxy: "http://127.0.0.1:7897",
      httpsProxy: "http://127.0.0.1:7897",
    });
  });

  it("normalizes socks5h:// HTTPS_PROXY — sets httpsProxy only, never httpProxy", () => {
    const env = { HTTPS_PROXY: "socks5h://127.0.0.1:7897" } as NodeJS.ProcessEnv;
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({ httpsProxy: "http://127.0.0.1:7897" });
    expect(result).not.toHaveProperty("httpProxy");
  });

  it("normalizes socks5:// HTTP_PROXY even when ALL_PROXY is also set", () => {
    const env = {
      HTTP_PROXY: "socks5://127.0.0.1:7897",
      ALL_PROXY: "socks5://127.0.0.1:1080",
    } as NodeJS.ProcessEnv;
    const result = resolveAllProxyFallbackOptions(env);
    expect(result?.httpProxy).toBe("http://127.0.0.1:7897");
  });

  it("falls back to ALL_PROXY — sets httpsProxy only, never httpProxy", () => {
    const env = { ALL_PROXY: "socks5://127.0.0.1:1080" } as NodeJS.ProcessEnv;
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({ httpsProxy: "http://127.0.0.1:1080" });
    expect(result).not.toHaveProperty("httpProxy");
  });

  it("falls back to all_proxy (lowercase) — sets httpsProxy only", () => {
    const env = { all_proxy: "http://127.0.0.1:1080" } as NodeJS.ProcessEnv;
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({ httpsProxy: "http://127.0.0.1:1080" });
    expect(result).not.toHaveProperty("httpProxy");
  });

  it("does not fall back to ALL_PROXY when usable http:// HTTP_PROXY exists", () => {
    const env = {
      HTTP_PROXY: "http://127.0.0.1:7897",
      ALL_PROXY: "socks5://127.0.0.1:1080",
    } as NodeJS.ProcessEnv;
    expect(resolveAllProxyFallbackOptions(env)).toBeUndefined();
  });

  it("returns undefined for unknown protocol in ALL_PROXY", () => {
    const env = { ALL_PROXY: "ftp://127.0.0.1:21" } as NodeJS.ProcessEnv;
    expect(resolveAllProxyFallbackOptions(env)).toBeUndefined();
  });

  it("normalizes HTTPS_PROXY socks5:// without backfilling httpProxy from it", () => {
    const env = {
      HTTP_PROXY: "http://127.0.0.1:7897",
      HTTPS_PROXY: "socks5://127.0.0.1:7897",
    } as NodeJS.ProcessEnv;
    // HTTP_PROXY is usable, so httpProxy should not appear (agent reads it natively).
    // HTTPS_PROXY needs normalization → httpsProxy set.
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({ httpsProxy: "http://127.0.0.1:7897" });
  });

  it("normalizes HTTP_PROXY socks5:// while leaving usable HTTPS_PROXY to native agent", () => {
    const env = {
      HTTP_PROXY: "socks5://127.0.0.1:7897",
      HTTPS_PROXY: "https://127.0.0.1:7897",
    } as NodeJS.ProcessEnv;
    // HTTP_PROXY needs normalization → httpProxy set.
    // HTTPS_PROXY is usable (https://) → agent reads it natively, no explicit httpsProxy.
    const result = resolveAllProxyFallbackOptions(env);
    expect(result).toEqual({ httpProxy: "http://127.0.0.1:7897" });
    expect(result).not.toHaveProperty("httpsProxy");
  });
});
