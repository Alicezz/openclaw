import { describe, expect, it } from "vitest";
import { buildClawApiProvider } from "./provider-catalog.js";

describe("buildClawApiProvider", () => {
  it("returns a valid provider config with models", () => {
    const provider = buildClawApiProvider();
    expect(provider.baseUrl).toBe("https://clawapi.org/api/v1");
    expect(provider.api).toBe("openai-completions");
    expect(provider.models.length).toBeGreaterThan(0);
  });

  it("each model has required fields", () => {
    const provider = buildClawApiProvider();
    for (const model of provider.models) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.reasoning).toBe("boolean");
      expect(model.cost).toBeDefined();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
    }
  });
});
