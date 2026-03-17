import anthropicPlugin from "../../../extensions/anthropic/index.js";
import bravePlugin from "../../../extensions/brave/index.js";
import elevenLabsPlugin from "../../../extensions/elevenlabs/index.js";
import firecrawlPlugin from "../../../extensions/firecrawl/index.js";
import googlePlugin from "../../../extensions/google/index.js";
import microsoftPlugin from "../../../extensions/microsoft/index.js";
import minimaxPlugin from "../../../extensions/minimax/index.js";
import mistralPlugin from "../../../extensions/mistral/index.js";
import moonshotPlugin from "../../../extensions/moonshot/index.js";
import openAIPlugin from "../../../extensions/openai/index.js";
import perplexityPlugin from "../../../extensions/perplexity/index.js";
import xaiPlugin from "../../../extensions/xai/index.js";
import zaiPlugin from "../../../extensions/zai/index.js";
import { createCapturedPluginRegistration } from "../captured-registration.js";
import { loadPluginManifestRegistry } from "../manifest-registry.js";
import type {
  ImageGenerationProviderPlugin,
  MediaUnderstandingProviderPlugin,
  ProviderPlugin,
  SpeechProviderPlugin,
  WebSearchProviderPlugin,
} from "../types.js";

type RegistrablePlugin = {
  id: string;
  register: (api: ReturnType<typeof createCapturedPluginRegistration>["api"]) => void;
};

type CapabilityContractEntry<T> = {
  pluginId: string;
  provider: T;
};

type ProviderContractEntry = CapabilityContractEntry<ProviderPlugin>;

type WebSearchProviderContractEntry = CapabilityContractEntry<WebSearchProviderPlugin> & {
  credentialValue: unknown;
};

type SpeechProviderContractEntry = CapabilityContractEntry<SpeechProviderPlugin>;
type MediaUnderstandingProviderContractEntry =
  CapabilityContractEntry<MediaUnderstandingProviderPlugin>;
type ImageGenerationProviderContractEntry = CapabilityContractEntry<ImageGenerationProviderPlugin>;

type PluginRegistrationContractEntry = {
  pluginId: string;
  providerIds: string[];
  speechProviderIds: string[];
  mediaUnderstandingProviderIds: string[];
  imageGenerationProviderIds: string[];
  webSearchProviderIds: string[];
  toolNames: string[];
};

const bundledWebSearchPlugins: Array<RegistrablePlugin & { credentialValue: unknown }> = [
  { ...bravePlugin, credentialValue: "BSA-test" },
  { ...firecrawlPlugin, credentialValue: "fc-test" },
  { ...googlePlugin, credentialValue: "AIza-test" },
  { ...moonshotPlugin, credentialValue: "sk-test" },
  { ...perplexityPlugin, credentialValue: "pplx-test" },
  { ...xaiPlugin, credentialValue: "xai-test" },
];

const bundledSpeechPlugins: RegistrablePlugin[] = [elevenLabsPlugin, microsoftPlugin, openAIPlugin];

const bundledMediaUnderstandingPlugins: RegistrablePlugin[] = [
  anthropicPlugin,
  googlePlugin,
  minimaxPlugin,
  mistralPlugin,
  moonshotPlugin,
  openAIPlugin,
  zaiPlugin,
];

const bundledImageGenerationPlugins: RegistrablePlugin[] = [googlePlugin, openAIPlugin];

function captureRegistrations(plugin: RegistrablePlugin) {
  const captured = createCapturedPluginRegistration();
  plugin.register(captured.api);
  return captured;
}

function buildCapabilityContractRegistry<T>(params: {
  plugins: RegistrablePlugin[];
  select: (captured: ReturnType<typeof createCapturedPluginRegistration>) => T[];
}): CapabilityContractEntry<T>[] {
  return params.plugins.flatMap((plugin) => {
    const captured = captureRegistrations(plugin);
    return params.select(captured).map((provider) => ({
      pluginId: plugin.id,
      provider,
    }));
  });
}

export const providerContractRegistry: ProviderContractEntry[] = buildCapabilityContractRegistry({
  plugins: [],
  select: () => [],
});

// Keep this loader map aligned with the bundled provider ids discovered from
// manifest-registry so contract coverage keeps matching the real bundled set.
const bundledProviderContractPluginLoaders: Record<
  string,
  () => Promise<{ default: RegistrablePlugin }>
> = {
  "amazon-bedrock": () => import("../../../extensions/amazon-bedrock/index.js"),
  anthropic: () => import("../../../extensions/anthropic/index.js"),
  byteplus: () => import("../../../extensions/byteplus/index.js"),
  chutes: () => import("../../../extensions/chutes/index.js"),
  "cloudflare-ai-gateway": () => import("../../../extensions/cloudflare-ai-gateway/index.js"),
  "copilot-proxy": () => import("../../../extensions/copilot-proxy/index.js"),
  "github-copilot": () => import("../../../extensions/github-copilot/index.js"),
  google: () => import("../../../extensions/google/index.js"),
  huggingface: () => import("../../../extensions/huggingface/index.js"),
  kilocode: () => import("../../../extensions/kilocode/index.js"),
  kimi: () => import("../../../extensions/kimi-coding/index.js"),
  minimax: () => import("../../../extensions/minimax/index.js"),
  mistral: () => import("../../../extensions/mistral/index.js"),
  modelstudio: () => import("../../../extensions/modelstudio/index.js"),
  moonshot: () => import("../../../extensions/moonshot/index.js"),
  nvidia: () => import("../../../extensions/nvidia/index.js"),
  ollama: () => import("../../../extensions/ollama/index.js"),
  openai: () => import("../../../extensions/openai/index.js"),
  opencode: () => import("../../../extensions/opencode/index.js"),
  "opencode-go": () => import("../../../extensions/opencode-go/index.js"),
  openrouter: () => import("../../../extensions/openrouter/index.js"),
  qianfan: () => import("../../../extensions/qianfan/index.js"),
  "qwen-portal-auth": () => import("../../../extensions/qwen-portal-auth/index.js"),
  sglang: () => import("../../../extensions/sglang/index.js"),
  synthetic: () => import("../../../extensions/synthetic/index.js"),
  together: () => import("../../../extensions/together/index.js"),
  venice: () => import("../../../extensions/venice/index.js"),
  "vercel-ai-gateway": () => import("../../../extensions/vercel-ai-gateway/index.js"),
  vllm: () => import("../../../extensions/vllm/index.js"),
  volcengine: () => import("../../../extensions/volcengine/index.js"),
  xai: () => import("../../../extensions/xai/index.js"),
  xiaomi: () => import("../../../extensions/xiaomi/index.js"),
  zai: () => import("../../../extensions/zai/index.js"),
};

async function loadBundledProviderContractPlugins(): Promise<RegistrablePlugin[]> {
  const bundledProviderPluginIds = loadPluginManifestRegistry({})
    .plugins.filter((plugin) => plugin.origin === "bundled" && plugin.providers.length > 0)
    .map((plugin) => plugin.id)
    .toSorted((left, right) => left.localeCompare(right));

  const modules = await Promise.all(
    bundledProviderPluginIds.map((pluginId) => {
      const load = bundledProviderContractPluginLoaders[pluginId];
      if (!load) {
        throw new Error(`missing bundled provider contract loader for ${pluginId}`);
      }
      return load();
    }),
  );

  return modules.map((mod, index) => {
    const plugin = mod.default as RegistrablePlugin | undefined;
    if (!plugin) {
      throw new Error(
        `bundled provider contract plugin missing default export for ${bundledProviderPluginIds[index]}`,
      );
    }
    return plugin;
  });
}

const loadedBundledProviderRegistry: ProviderContractEntry[] = buildCapabilityContractRegistry({
  plugins: await loadBundledProviderContractPlugins(),
  select: (captured) => captured.providers,
});

providerContractRegistry.splice(
  0,
  providerContractRegistry.length,
  ...loadedBundledProviderRegistry,
);

export const uniqueProviderContractProviders: ProviderPlugin[] = [
  ...new Map(providerContractRegistry.map((entry) => [entry.provider.id, entry.provider])).values(),
];

export const providerContractPluginIds = [
  ...new Set(providerContractRegistry.map((entry) => entry.pluginId)),
].toSorted((left, right) => left.localeCompare(right));

export const providerContractCompatPluginIds = providerContractPluginIds.map((pluginId) =>
  pluginId === "kimi-coding" ? "kimi" : pluginId,
);

export function requireProviderContractProvider(providerId: string): ProviderPlugin {
  const provider = uniqueProviderContractProviders.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`provider contract entry missing for ${providerId}`);
  }
  return provider;
}

export function resolveProviderContractPluginIdsForProvider(
  providerId: string,
): string[] | undefined {
  const pluginIds = [
    ...new Set(
      providerContractRegistry
        .filter((entry) => entry.provider.id === providerId)
        .map((entry) => entry.pluginId),
    ),
  ];
  return pluginIds.length > 0 ? pluginIds : undefined;
}

export function resolveProviderContractProvidersForPluginIds(
  pluginIds: readonly string[],
): ProviderPlugin[] {
  const allowed = new Set(pluginIds);
  return [
    ...new Map(
      providerContractRegistry
        .filter((entry) => allowed.has(entry.pluginId))
        .map((entry) => [entry.provider.id, entry.provider]),
    ).values(),
  ];
}

export const webSearchProviderContractRegistry: WebSearchProviderContractEntry[] =
  bundledWebSearchPlugins.flatMap((plugin) => {
    const captured = captureRegistrations(plugin);
    return captured.webSearchProviders.map((provider) => ({
      pluginId: plugin.id,
      provider,
      credentialValue: plugin.credentialValue,
    }));
  });

export const speechProviderContractRegistry: SpeechProviderContractEntry[] =
  buildCapabilityContractRegistry({
    plugins: bundledSpeechPlugins,
    select: (captured) => captured.speechProviders,
  });

export const mediaUnderstandingProviderContractRegistry: MediaUnderstandingProviderContractEntry[] =
  buildCapabilityContractRegistry({
    plugins: bundledMediaUnderstandingPlugins,
    select: (captured) => captured.mediaUnderstandingProviders,
  });

export const imageGenerationProviderContractRegistry: ImageGenerationProviderContractEntry[] =
  buildCapabilityContractRegistry({
    plugins: bundledImageGenerationPlugins,
    select: (captured) => captured.imageGenerationProviders,
  });

const bundledPluginRegistrationList = [
  ...new Map(
    [
      ...bundledSpeechPlugins,
      ...bundledMediaUnderstandingPlugins,
      ...bundledImageGenerationPlugins,
      ...bundledWebSearchPlugins,
    ].map((plugin) => [plugin.id, plugin]),
  ).values(),
];

export const pluginRegistrationContractRegistry: PluginRegistrationContractEntry[] = [
  ...new Map(
    providerContractRegistry.map((entry) => [
      entry.pluginId,
      {
        pluginId: entry.pluginId,
        providerIds: providerContractRegistry
          .filter((candidate) => candidate.pluginId === entry.pluginId)
          .map((candidate) => candidate.provider.id),
        speechProviderIds: [] as string[],
        mediaUnderstandingProviderIds: [] as string[],
        imageGenerationProviderIds: [] as string[],
        webSearchProviderIds: [] as string[],
        toolNames: [] as string[],
      },
    ]),
  ).values(),
];

for (const plugin of bundledPluginRegistrationList) {
  const captured = captureRegistrations(plugin);
  const existing = pluginRegistrationContractRegistry.find((entry) => entry.pluginId === plugin.id);
  const next = {
    pluginId: plugin.id,
    providerIds: captured.providers.map((provider) => provider.id),
    speechProviderIds: captured.speechProviders.map((provider) => provider.id),
    mediaUnderstandingProviderIds: captured.mediaUnderstandingProviders.map(
      (provider) => provider.id,
    ),
    imageGenerationProviderIds: captured.imageGenerationProviders.map((provider) => provider.id),
    webSearchProviderIds: captured.webSearchProviders.map((provider) => provider.id),
    toolNames: captured.tools.map((tool) => tool.name),
  };
  if (!existing) {
    pluginRegistrationContractRegistry.push(next);
    continue;
  }
  existing.providerIds = next.providerIds.length > 0 ? next.providerIds : existing.providerIds;
  existing.speechProviderIds = next.speechProviderIds;
  existing.mediaUnderstandingProviderIds = next.mediaUnderstandingProviderIds;
  existing.imageGenerationProviderIds = next.imageGenerationProviderIds;
  existing.webSearchProviderIds = next.webSearchProviderIds;
  existing.toolNames = next.toolNames;
}
