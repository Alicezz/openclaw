import { Type } from "@sinclair/typebox";
import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/plugin-runtime";
import {
  readResponseText,
  withTrustedWebToolsEndpoint,
} from "openclaw/plugin-sdk/provider-web-search";
import { wrapWebContent } from "openclaw/plugin-sdk/security-runtime";

const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_SEARCH_TYPE = "auto";
const DEFAULT_TIMEOUT_SECONDS = 30;

type ExaSearchType = "neural" | "keyword" | "auto";
type ExaFreshness = "day" | "week" | "month" | "year";

type ExaContentsArgs = {
  highlights?: boolean;
  text?: boolean;
};

type ExaSearchResult = {
  title?: unknown;
  url?: unknown;
  publishedDate?: unknown;
  highlights?: unknown;
  text?: unknown;
};

type ExaSearchResponse = {
  results?: unknown;
};

const ExaSearchSchema = Type.Object(
  {
    query: Type.String({ description: "Search query string." }),
    count: Type.Optional(
      Type.Number({
        description: "Number of results to return (1-10).",
        minimum: 1,
        maximum: MAX_SEARCH_COUNT,
      }),
    ),
    freshness: Type.Optional(
      Type.String({
        description: "Time filter: day, week, month, year (also accepts pd/pw/pm/py).",
      }),
    ),
    date_after: Type.Optional(
      Type.String({
        description: "Only include results published after this date (YYYY-MM-DD or ISO datetime).",
      }),
    ),
    date_before: Type.Optional(
      Type.String({
        description:
          "Only include results published before this date (YYYY-MM-DD or ISO datetime).",
      }),
    ),
    type: Type.Optional(
      Type.Union([Type.Literal("neural"), Type.Literal("keyword"), Type.Literal("auto")], {
        description: "Exa search mode (neural, keyword, or auto). Default: auto.",
      }),
    ),
    contents: Type.Optional(
      Type.Object(
        {
          highlights: Type.Optional(
            Type.Boolean({ description: "Include Exa highlights in results." }),
          ),
          text: Type.Optional(Type.Boolean({ description: "Include full text in results." })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

function normalizeApiKey(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function getScopedCredentialValue(searchConfig?: Record<string, unknown>): unknown {
  const scoped = searchConfig?.exa;
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    return undefined;
  }
  return (scoped as Record<string, unknown>).apiKey;
}

function setScopedCredentialValue(
  searchConfigTarget: Record<string, unknown>,
  value: unknown,
): void {
  const scoped = searchConfigTarget.exa;
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    searchConfigTarget.exa = { apiKey: value };
    return;
  }
  (scoped as Record<string, unknown>).apiKey = value;
}

function resolveExaApiKey(searchConfig?: Record<string, unknown>): string | undefined {
  const fromConfig = normalizeApiKey(getScopedCredentialValue(searchConfig));
  if (fromConfig) {
    return fromConfig;
  }
  return normalizeApiKey(process.env.EXA_API_KEY);
}

function resolveSearchCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_COUNT;
  }
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(value)));
}

function normalizeSearchType(value: unknown): ExaSearchType {
  if (value === "neural" || value === "keyword" || value === "auto") {
    return value;
  }
  return DEFAULT_SEARCH_TYPE;
}

function resolveFreshness(value: unknown): ExaFreshness | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "pd" || normalized === "day") {
    return "day";
  }
  if (normalized === "pw" || normalized === "week") {
    return "week";
  }
  if (normalized === "pm" || normalized === "month") {
    return "month";
  }
  if (normalized === "py" || normalized === "year") {
    return "year";
  }
  return undefined;
}

function toIsoDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.valueOf())) {
    return undefined;
  }
  return date.toISOString();
}

function resolveFreshnessStartDate(freshness: ExaFreshness): string {
  const date = new Date();
  if (freshness === "day") {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (freshness === "week") {
    date.setUTCDate(date.getUTCDate() - 7);
  } else if (freshness === "month") {
    date.setUTCMonth(date.getUTCMonth() - 1);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() - 1);
  }
  return date.toISOString();
}

function resolveDescription(result: ExaSearchResult): string {
  const highlights = result.highlights;
  if (Array.isArray(highlights)) {
    const highlightText = highlights
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .join("\n");
    if (highlightText) {
      return highlightText;
    }
  }
  const text = result.text;
  return typeof text === "string" ? text : "";
}

function normalizeExaResults(payload: unknown): ExaSearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const results = (payload as ExaSearchResponse).results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.filter((entry): entry is ExaSearchResult =>
    Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
  );
}

async function runExaSearch(params: {
  apiKey: string;
  query: string;
  count: number;
  freshness?: ExaFreshness;
  dateAfter?: string;
  dateBefore?: string;
  type: ExaSearchType;
  contents?: ExaContentsArgs;
  timeoutSeconds?: number;
}): Promise<ExaSearchResult[]> {
  const body: Record<string, unknown> = {
    query: params.query,
    numResults: params.count,
    type: params.type,
  };

  if (params.contents) {
    body.contents = params.contents;
  }
  if (params.dateAfter) {
    body.startPublishedDate = params.dateAfter;
  }
  if (params.dateBefore) {
    body.endPublishedDate = params.dateBefore;
  }
  if (!params.dateAfter && params.freshness) {
    body.startPublishedDate = resolveFreshnessStartDate(params.freshness);
  }

  return await withTrustedWebToolsEndpoint(
    {
      url: EXA_SEARCH_ENDPOINT,
      timeoutSeconds: params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": params.apiKey,
        },
        body: JSON.stringify(body),
      },
    },
    async ({ response }) => {
      if (!response.ok) {
        const detailResult = await readResponseText(response, { maxBytes: 64_000 });
        throw new Error(
          `Exa API error (${response.status}): ${detailResult.text || response.statusText}`,
        );
      }

      try {
        return normalizeExaResults(await response.json());
      } catch (error) {
        throw new Error(`Exa API returned invalid JSON: ${String(error)}`, { cause: error });
      }
    },
  );
}

export function createExaWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "exa",
    label: "Exa Search",
    hint: "Neural and keyword hybrid search",
    envVars: ["EXA_API_KEY"],
    placeholder: "exa-...",
    signupUrl: "https://exa.ai/",
    docsUrl: "https://docs.openclaw.ai/tools/web",
    autoDetectOrder: 25,
    getCredentialValue: getScopedCredentialValue,
    setCredentialValue: setScopedCredentialValue,
    createTool: (ctx) => ({
      description:
        "Search the web using Exa. Supports neural/keyword modes, publication date filters, and optional content highlights/text.",
      parameters: ExaSearchSchema,
      execute: async (args) => {
        const apiKey = resolveExaApiKey(ctx.searchConfig);
        if (!apiKey) {
          throw new Error(
            "web_search (exa) needs an Exa API key. Set EXA_API_KEY in the Gateway environment, or configure tools.web.search.exa.apiKey.",
          );
        }

        // Strict validation: reject invalid params rather than silently normalizing.
        const rawQuery = args.query;
        if (typeof rawQuery !== "string" || rawQuery.trim() === "") {
          throw new Error("web_search (exa): query must be a non-empty string.");
        }
        const query = rawQuery.trim();

        const rawType = args.type;
        if (
          rawType !== undefined &&
          rawType !== "neural" &&
          rawType !== "keyword" &&
          rawType !== "auto"
        ) {
          throw new Error(
            `web_search (exa): invalid type "${String(rawType)}". Must be "neural", "keyword", or "auto".`,
          );
        }

        const rawContents = args.contents;
        if (rawContents !== undefined) {
          if (!rawContents || typeof rawContents !== "object" || Array.isArray(rawContents)) {
            throw new Error(
              "web_search (exa): contents must be an object with optional boolean highlights and text fields.",
            );
          }
          const contentsObj = rawContents as Record<string, unknown>;
          for (const key of ["highlights", "text"] as const) {
            if (key in contentsObj && typeof contentsObj[key] !== "boolean") {
              throw new Error(
                `web_search (exa): contents.${key} must be a boolean, got ${typeof contentsObj[key]}.`,
              );
            }
          }
          for (const key of Object.keys(contentsObj)) {
            if (key !== "highlights" && key !== "text") {
              throw new Error(
                `web_search (exa): contents has unknown field "${key}". Only "highlights" and "text" are allowed.`,
              );
            }
          }
        }

        const rawDateAfter = args.date_after;
        if (rawDateAfter !== undefined && typeof rawDateAfter !== "string") {
          throw new Error(
            "web_search (exa): date_after must be a string (YYYY-MM-DD or ISO datetime).",
          );
        }
        if (typeof rawDateAfter === "string" && rawDateAfter.trim() !== "") {
          const parsed = toIsoDateTime(rawDateAfter.trim());
          if (!parsed) {
            throw new Error(
              `web_search (exa): date_after "${rawDateAfter}" is not a valid date. Use YYYY-MM-DD or ISO datetime format.`,
            );
          }
        }

        const rawDateBefore = args.date_before;
        if (rawDateBefore !== undefined && typeof rawDateBefore !== "string") {
          throw new Error(
            "web_search (exa): date_before must be a string (YYYY-MM-DD or ISO datetime).",
          );
        }
        if (typeof rawDateBefore === "string" && rawDateBefore.trim() !== "") {
          const parsed = toIsoDateTime(rawDateBefore.trim());
          if (!parsed) {
            throw new Error(
              `web_search (exa): date_before "${rawDateBefore}" is not a valid date. Use YYYY-MM-DD or ISO datetime format.`,
            );
          }
        }

        const count = resolveSearchCount(args.count);
        const type = normalizeSearchType(args.type);
        const freshness = resolveFreshness(args.freshness);
        const dateAfter =
          typeof args.date_after === "string" ? toIsoDateTime(args.date_after) : undefined;
        const dateBefore =
          typeof args.date_before === "string" ? toIsoDateTime(args.date_before) : undefined;
        const contents =
          args.contents && typeof args.contents === "object" && !Array.isArray(args.contents)
            ? {
                ...(typeof (args.contents as Record<string, unknown>).highlights === "boolean"
                  ? { highlights: (args.contents as Record<string, unknown>).highlights as boolean }
                  : {}),
                ...(typeof (args.contents as Record<string, unknown>).text === "boolean"
                  ? { text: (args.contents as Record<string, unknown>).text as boolean }
                  : {}),
              }
            : undefined;

        const start = Date.now();
        const results = await runExaSearch({
          apiKey,
          query,
          count,
          freshness,
          dateAfter,
          dateBefore,
          type,
          contents,
          timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        });

        return {
          query,
          provider: "exa",
          count: results.length,
          tookMs: Date.now() - start,
          externalContent: {
            untrusted: true,
            source: "web_search",
            provider: "exa",
            wrapped: true,
          },
          results: results.map((entry) => {
            const title = typeof entry.title === "string" ? entry.title : "";
            const url = typeof entry.url === "string" ? entry.url : "";
            const description = resolveDescription(entry);
            const published =
              typeof entry.publishedDate === "string" && entry.publishedDate
                ? entry.publishedDate
                : undefined;
            return {
              title: title ? wrapWebContent(title, "web_search") : "",
              url,
              description: description ? wrapWebContent(description, "web_search") : "",
              published,
              siteName: resolveSiteName(url),
            };
          }),
        };
      },
    }),
  };
}

export const __testing = {
  normalizeExaResults,
  resolveDescription,
  resolveFreshness,
  resolveFreshnessStartDate,
  toIsoDateTime,
};
