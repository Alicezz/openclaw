import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveProviderUsageAuthWithPluginMock = vi.fn();

vi.mock("../plugins/provider-runtime.js", () => ({
  resolveProviderUsageAuthWithPlugin: (...args: unknown[]) =>
    resolveProviderUsageAuthWithPluginMock(...args),
}));

import { resolveProviderAuths } from "./provider-usage.auth.js";

describe("resolveProviderAuths plugin seam", () => {
  beforeEach(() => {
    resolveProviderUsageAuthWithPluginMock.mockReset();
    resolveProviderUsageAuthWithPluginMock.mockResolvedValue(null);
  });

  it("prefers plugin-owned usage auth when available", async () => {
    resolveProviderUsageAuthWithPluginMock.mockResolvedValueOnce({
      token: "plugin-zai-token",
    });

    await expect(
      resolveProviderAuths({
        providers: ["zai"],
      }),
    ).resolves.toEqual([
      {
        provider: "zai",
        token: "plugin-zai-token",
      },
    ]);
  });

  it("skips plugin resolution when built-in auth can be resolved directly", async () => {
    const prev = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "minimax-test-key";

    try {
      await expect(
        resolveProviderAuths({
          providers: ["minimax"],
        }),
      ).resolves.toEqual([
        {
          provider: "minimax",
          token: "minimax-test-key",
        },
      ]);
    } finally {
      if (prev === undefined) {
        delete process.env.MINIMAX_API_KEY;
      } else {
        process.env.MINIMAX_API_KEY = prev;
      }
    }

    expect(resolveProviderUsageAuthWithPluginMock).not.toHaveBeenCalled();
  });
});
