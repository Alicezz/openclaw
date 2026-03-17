import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..");

function inspectChutesPlugin() {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      `
        const [{ default: plugin }, { createCapturedPluginRegistration }] = await Promise.all([
          import("./extensions/chutes/index.ts"),
          import("./src/plugins/captured-registration.ts"),
        ]);
        const captured = createCapturedPluginRegistration();
        plugin.register(captured.api);
        const provider = captured.providers[0];
        if (!provider) {
          throw new Error("provider registration missing");
        }
        console.log(JSON.stringify({
          id: provider.id,
          authIds: provider.auth.map((method) => method.id),
          hasCatalogRun: typeof provider.catalog?.run === "function",
        }));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  return JSON.parse(output) as {
    id: string;
    authIds: string[];
    hasCatalogRun: boolean;
  };
}

describe("chutes provider plugin", () => {
  it("registers OAuth and API key auth flows under one provider", () => {
    const provider = inspectChutesPlugin();

    expect(provider.id).toBe("chutes");
    expect(provider.authIds).toEqual(["oauth", "api-key"]);
    expect(provider.hasCatalogRun).toBe(true);
  });
});
