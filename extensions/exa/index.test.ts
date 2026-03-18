import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import { __testing as exaTesting } from "./src/exa-search-provider.js";

describe("exa plugin", () => {
  it("registers the expected plugin metadata", () => {
    expect(plugin.id).toBe("exa");
    expect(plugin.name).toBe("Exa Plugin");
  });

  it("normalizes Exa results into provider output fields", () => {
    expect(
      exaTesting.normalizeExaResults({
        results: [
          {
            title: "Example result",
            url: "https://example.com/post",
            publishedDate: "2024-01-15T12:00:00.000Z",
            highlights: ["first highlight", "second highlight"],
            text: "fallback text",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Example result",
        url: "https://example.com/post",
        publishedDate: "2024-01-15T12:00:00.000Z",
        highlights: ["first highlight", "second highlight"],
        text: "fallback text",
      },
    ]);
  });

  it("prefers highlights over text when resolving descriptions", () => {
    expect(
      exaTesting.resolveDescription({
        highlights: ["first", "second"],
        text: "fallback",
      }),
    ).toBe("first\nsecond");
    expect(exaTesting.resolveDescription({ text: "fallback" })).toBe("fallback");
  });

  it("supports freshness aliases and ISO date conversion", () => {
    expect(exaTesting.resolveFreshness("pw")).toBe("week");
    expect(exaTesting.resolveFreshness("year")).toBe("year");
    expect(exaTesting.toIsoDateTime("2024-03-10")).toBe("2024-03-10T00:00:00.000Z");
  });
});
