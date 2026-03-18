import { beforeEach, describe, it, vi } from "vitest";
import {
  expectAugmentedCodexCatalog,
  expectCodexBuiltInSuppression,
  expectCodexMissingAuthHint,
} from "../provider-runtime.test-support.js";

let augmentModelCatalogWithProviderPlugins: typeof import("../provider-runtime.js").augmentModelCatalogWithProviderPlugins;
let buildProviderMissingAuthMessageWithPlugin: typeof import("../provider-runtime.js").buildProviderMissingAuthMessageWithPlugin;
let resetProviderRuntimeHookCacheForTest: typeof import("../provider-runtime.js").resetProviderRuntimeHookCacheForTest;
let resolveProviderBuiltInModelSuppression: typeof import("../provider-runtime.js").resolveProviderBuiltInModelSuppression;

describe("provider catalog contract", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({
      augmentModelCatalogWithProviderPlugins,
      buildProviderMissingAuthMessageWithPlugin,
      resetProviderRuntimeHookCacheForTest,
      resolveProviderBuiltInModelSuppression,
    } = await import("../provider-runtime.js"));
    resetProviderRuntimeHookCacheForTest();
  });

  it("keeps codex-only missing-auth hints wired through the provider runtime", () => {
    expectCodexMissingAuthHint(buildProviderMissingAuthMessageWithPlugin);
  });

  it("keeps built-in model suppression wired through the provider runtime", () => {
    expectCodexBuiltInSuppression(resolveProviderBuiltInModelSuppression);
  });

  it("keeps bundled model augmentation wired through the provider runtime", async () => {
    await expectAugmentedCodexCatalog(augmentModelCatalogWithProviderPlugins);
  });
});
