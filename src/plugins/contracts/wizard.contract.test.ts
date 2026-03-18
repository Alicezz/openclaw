import { beforeEach, describe, expect, it, vi } from "vitest";
import { providerContractPluginIds, uniqueProviderContractProviders } from "./registry.js";

let resolveProviderModelPickerEntries: typeof import("../provider-wizard.js").resolveProviderModelPickerEntries;
let resolveProviderPluginChoice: typeof import("../provider-wizard.js").resolveProviderPluginChoice;
let resolveProviderWizardOptions: typeof import("../provider-wizard.js").resolveProviderWizardOptions;

describe("provider wizard contract", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({
      resolveProviderModelPickerEntries,
      resolveProviderPluginChoice,
      resolveProviderWizardOptions,
    } = await import("../provider-wizard.js"));
  });

  it("exposes every registered provider setup choice through the shared wizard layer", () => {
    const options = resolveProviderWizardOptions({
      config: {
        plugins: {
          enabled: true,
          allow: providerContractPluginIds,
          slots: {
            memory: "none",
          },
        },
      },
      env: process.env,
    });
    const values = options.map((option) => option.value);

    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...new Set(values)]);
    for (const option of options) {
      const resolved = resolveProviderPluginChoice({
        providers: uniqueProviderContractProviders,
        choice: option.value,
      });
      expect(resolved).not.toBeNull();
    }
  });

  it("round-trips every shared wizard choice back to its provider and auth method", () => {
    for (const option of resolveProviderWizardOptions({ config: {}, env: process.env })) {
      const resolved = resolveProviderPluginChoice({
        providers: uniqueProviderContractProviders,
        choice: option.value,
      });
      expect(resolved).not.toBeNull();
      expect(resolved?.provider.id).toBeTruthy();
      expect(resolved?.method.id).toBeTruthy();
    }
  });

  it("exposes every registered model-picker entry through the shared wizard layer", () => {
    const entries = resolveProviderModelPickerEntries({ config: {}, env: process.env });
    const values = entries.map((entry) => entry.value);
    expect(values).toEqual([...new Set(values)]);
    for (const entry of entries) {
      const resolved = resolveProviderPluginChoice({
        providers: uniqueProviderContractProviders,
        choice: entry.value,
      });
      expect(resolved).not.toBeNull();
    }
  });
});
