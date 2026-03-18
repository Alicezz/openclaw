import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setGlobalDispatcher = vi.hoisted(() => vi.fn());
const getGlobalDispatcher = vi.hoisted(() => vi.fn(() => ({ constructor: { name: "MockAgent" } })));
const EnvHttpProxyAgentCtor = vi.hoisted(() =>
  vi.fn(function MockEnvHttpProxyAgent(this: object) {
    Object.defineProperty(this, "constructor", { value: { name: "EnvHttpProxyAgent" } });
  }),
);

vi.mock("undici", () => ({
  EnvHttpProxyAgent: EnvHttpProxyAgentCtor,
  getGlobalDispatcher,
  setGlobalDispatcher,
}));

let applyGlobalProxyDispatcher: typeof import("./global-proxy.js").applyGlobalProxyDispatcher;
let resetGlobalProxyStateForTests: typeof import("./global-proxy.js").resetGlobalProxyStateForTests;

beforeEach(async () => {
  vi.resetModules();
  setGlobalDispatcher.mockClear();
  getGlobalDispatcher.mockClear();
  EnvHttpProxyAgentCtor.mockClear();
  getGlobalDispatcher.mockReturnValue({ constructor: { name: "MockAgent" } });
  const mod = await import("./global-proxy.js");
  applyGlobalProxyDispatcher = mod.applyGlobalProxyDispatcher;
  resetGlobalProxyStateForTests = mod.resetGlobalProxyStateForTests;
});

afterEach(() => {
  resetGlobalProxyStateForTests();
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.ALL_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.all_proxy;
});

describe("applyGlobalProxyDispatcher", () => {
  it("sets global dispatcher when HTTPS_PROXY is set", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledTimes(1);
  });

  it("sets global dispatcher when HTTP_PROXY is set", () => {
    process.env.HTTP_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("sets global dispatcher when ALL_PROXY is set", () => {
    process.env.ALL_PROXY = "socks5://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("rewrites socks5:// ALL_PROXY — sets httpsProxy only", () => {
    process.env.ALL_PROXY = "socks5://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({
      httpsProxy: "http://127.0.0.1:7897",
    });
  });

  it("rewrites socks5h:// ALL_PROXY — sets httpsProxy only", () => {
    process.env.ALL_PROXY = "socks5h://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({
      httpsProxy: "http://127.0.0.1:7897",
    });
  });

  it("passes http:// ALL_PROXY as httpsProxy only", () => {
    process.env.ALL_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({
      httpsProxy: "http://127.0.0.1:7897",
    });
  });

  it("passes all_proxy (lowercase) as httpsProxy only", () => {
    process.env.all_proxy = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({
      httpsProxy: "http://127.0.0.1:7897",
    });
  });

  it.skipIf(process.platform === "win32")(
    "prefers lowercase all_proxy over uppercase ALL_PROXY",
    () => {
      process.env.all_proxy = "http://127.0.0.1:1080";
      process.env.ALL_PROXY = "http://127.0.0.1:7897";
      applyGlobalProxyDispatcher();
      expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({
        httpsProxy: "http://127.0.0.1:1080",
      });
    },
  );

  it("does not pass explicit options when HTTP_PROXY is also set alongside ALL_PROXY", () => {
    process.env.HTTP_PROXY = "http://127.0.0.1:8080";
    process.env.ALL_PROXY = "socks5://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({});
  });

  it("does not pass explicit options when HTTPS_PROXY is set (no ALL_PROXY fallback needed)", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(EnvHttpProxyAgentCtor).toHaveBeenCalledWith({});
  });

  it("sets global dispatcher when lowercase proxy vars are set", () => {
    process.env.https_proxy = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no proxy env var is set", () => {
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
    expect(EnvHttpProxyAgentCtor).not.toHaveBeenCalled();
  });

  it("only applies once even if called multiple times", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    applyGlobalProxyDispatcher();
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("skips if a proxy-like dispatcher is already installed", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    getGlobalDispatcher.mockReturnValue({ constructor: { name: "ProxyAgent" } });
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });

  it("does not skip if existing dispatcher is not proxy-like", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    getGlobalDispatcher.mockReturnValue({ constructor: { name: "Agent" } });
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("handles EnvHttpProxyAgent constructor failure gracefully", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    EnvHttpProxyAgentCtor.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => applyGlobalProxyDispatcher()).not.toThrow();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });

  it("retries when proxy env appears after an initial no-proxy call", () => {
    // First call: no proxy vars → no-op, latch must NOT lock.
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();

    // Second call: proxy vars now present (e.g. dotenv loaded between restarts).
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("retries after constructor failure on next call", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    EnvHttpProxyAgentCtor.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();

    // Retry: constructor succeeds this time.
    applyGlobalProxyDispatcher();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });
});
