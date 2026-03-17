import path from "node:path";
import type { AnyAgentTool } from "../agents/tools/common.js";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { registerContextEngineForOwner } from "../context-engine/registry.js";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlers,
} from "../gateway/server-methods/types.js";
import { registerInternalHook } from "../hooks/internal-hooks.js";
import type { HookEntry } from "../hooks/types.js";
import { resolveUserPath } from "../utils.js";
import { normalizePluginHttpPath } from "./http-path.js";
import { findOverlappingPluginHttpRoute } from "./http-route-overlap.js";
import { registerPluginInteractiveHandler } from "./interactive.js";
import { normalizeRegisteredProvider } from "./provider-validation.js";
import type { PluginRuntime } from "./runtime/types.js";
import { defaultSlotIdForKey } from "./slots.js";
import {
  isPluginHookName,
  isPromptInjectionHookName,
  stripPromptMutationFieldsFromLegacyHookResult,
} from "./types.js";
import type {
  ImageGenerationProviderPlugin,
  OpenClawPluginApi,
  OpenClawPluginChannelRegistration,
  OpenClawPluginCliRegistrar,
  OpenClawPluginCommandDefinition,
  OpenClawPluginHttpRouteAuth,
  OpenClawPluginHttpRouteMatch,
  OpenClawPluginHttpRouteHandler,
  OpenClawPluginHttpRouteParams,
  OpenClawPluginHookOptions,
  MediaUnderstandingProviderPlugin,
  ProviderPlugin,
  OpenClawPluginService,
  OpenClawPluginToolContext,
  OpenClawPluginToolFactory,
  PluginConfigUiHint,
  PluginDiagnostic,
  PluginBundleFormat,
  PluginFormat,
  PluginLogger,
  PluginOrigin,
  PluginKind,
  PluginRegistrationMode,
  PluginResetSessionResult,
  PluginHookName,
  PluginHookHandlerMap,
  PluginHookRegistration as TypedPluginHookRegistration,
  SpeechProviderPlugin,
  WebSearchProviderPlugin,
} from "./types.js";

type GatewaySessionResetModule = typeof import("../gateway/session-reset-service.js");

export type PluginToolRegistration = {
  pluginId: string;
  pluginName?: string;
  factory: OpenClawPluginToolFactory;
  names: string[];
  optional: boolean;
  source: string;
  rootDir?: string;
};

export type PluginCliRegistration = {
  pluginId: string;
  pluginName?: string;
  register: OpenClawPluginCliRegistrar;
  commands: string[];
  source: string;
  rootDir?: string;
};

export type PluginHttpRouteRegistration = {
  pluginId?: string;
  path: string;
  handler: OpenClawPluginHttpRouteHandler;
  auth: OpenClawPluginHttpRouteAuth;
  match: OpenClawPluginHttpRouteMatch;
  source?: string;
};

export type PluginChannelRegistration = {
  pluginId: string;
  pluginName?: string;
  plugin: ChannelPlugin;
  source: string;
  rootDir?: string;
};

export type PluginChannelSetupRegistration = {
  pluginId: string;
  pluginName?: string;
  plugin: ChannelPlugin;
  source: string;
  enabled: boolean;
  rootDir?: string;
};

export type PluginProviderRegistration = {
  pluginId: string;
  pluginName?: string;
  provider: ProviderPlugin;
  source: string;
  rootDir?: string;
};

type PluginOwnedProviderRegistration<T extends { id: string }> = {
  pluginId: string;
  pluginName?: string;
  provider: T;
  source: string;
  rootDir?: string;
};

export type PluginSpeechProviderRegistration =
  PluginOwnedProviderRegistration<SpeechProviderPlugin>;
export type PluginMediaUnderstandingProviderRegistration =
  PluginOwnedProviderRegistration<MediaUnderstandingProviderPlugin>;
export type PluginImageGenerationProviderRegistration =
  PluginOwnedProviderRegistration<ImageGenerationProviderPlugin>;
export type PluginWebSearchProviderRegistration =
  PluginOwnedProviderRegistration<WebSearchProviderPlugin>;

export type PluginHookRegistration = {
  pluginId: string;
  entry: HookEntry;
  events: string[];
  source: string;
  rootDir?: string;
};

export type PluginServiceRegistration = {
  pluginId: string;
  pluginName?: string;
  service: OpenClawPluginService;
  source: string;
  rootDir?: string;
};

export type PluginCommandRegistration = {
  pluginId: string;
  pluginName?: string;
  command: OpenClawPluginCommandDefinition;
  source: string;
  rootDir?: string;
};

export type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  format?: PluginFormat;
  bundleFormat?: PluginBundleFormat;
  bundleCapabilities?: string[];
  kind?: PluginKind;
  source: string;
  rootDir?: string;
  origin: PluginOrigin;
  workspaceDir?: string;
  enabled: boolean;
  status: "loaded" | "disabled" | "error";
  error?: string;
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  providerIds: string[];
  speechProviderIds: string[];
  mediaUnderstandingProviderIds: string[];
  imageGenerationProviderIds: string[];
  webSearchProviderIds: string[];
  gatewayMethods: string[];
  cliCommands: string[];
  services: string[];
  commands: string[];
  httpRoutes: number;
  hookCount: number;
  configSchema: boolean;
  configUiHints?: Record<string, PluginConfigUiHint>;
  configJsonSchema?: Record<string, unknown>;
};

export type PluginRegistry = {
  plugins: PluginRecord[];
  tools: PluginToolRegistration[];
  hooks: PluginHookRegistration[];
  typedHooks: TypedPluginHookRegistration[];
  channels: PluginChannelRegistration[];
  channelSetups: PluginChannelSetupRegistration[];
  providers: PluginProviderRegistration[];
  speechProviders: PluginSpeechProviderRegistration[];
  mediaUnderstandingProviders: PluginMediaUnderstandingProviderRegistration[];
  imageGenerationProviders: PluginImageGenerationProviderRegistration[];
  webSearchProviders: PluginWebSearchProviderRegistration[];
  gatewayHandlers: GatewayRequestHandlers;
  httpRoutes: PluginHttpRouteRegistration[];
  cliRegistrars: PluginCliRegistration[];
  services: PluginServiceRegistration[];
  commands: PluginCommandRegistration[];
  diagnostics: PluginDiagnostic[];
};

export type PluginRegistryParams = {
  logger: PluginLogger;
  coreGatewayHandlers?: GatewayRequestHandlers;
  runtime: PluginRuntime;
  // When true, skip writing to the global plugin command registry during register().
  // Used by non-activating snapshot loads to avoid leaking commands into the running gateway.
  suppressGlobalCommands?: boolean;
  loadSessionResetModule?: () => Promise<GatewaySessionResetModule>;
};

type PluginTypedHookPolicy = {
  allowPromptInjection?: boolean;
};

const RESERVED_PLUGIN_COMMANDS = new Set([
  "help",
  "commands",
  "status",
  "whoami",
  "context",
  "btw",
  "stop",
  "restart",
  "reset",
  "new",
  "compact",
  "config",
  "debug",
  "allowlist",
  "activation",
  "skill",
  "subagents",
  "kill",
  "steer",
  "tell",
  "model",
  "models",
  "queue",
  "send",
  "bash",
  "exec",
  "think",
  "verbose",
  "reasoning",
  "elevated",
  "usage",
]);

const VALID_PLUGIN_COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/;

const validatePluginCommandName = (rawName: string): string | null => {
  const trimmed = rawName.trim().toLowerCase();
  if (!trimmed) {
    return "Command name cannot be empty";
  }
  if (!VALID_PLUGIN_COMMAND_NAME_RE.test(trimmed)) {
    return "Command name must start with a letter and contain only letters, numbers, hyphens, and underscores";
  }
  if (RESERVED_PLUGIN_COMMANDS.has(trimmed)) {
    return `Command name "${trimmed}" is reserved by a built-in command`;
  }
  return null;
};

const validatePluginCommandDefinitionLocal = (
  command: OpenClawPluginCommandDefinition,
): string | null => {
  if (typeof command.handler !== "function") {
    return "Command handler must be a function";
  }
  if (typeof command.name !== "string") {
    return "Command name must be a string";
  }
  if (typeof command.description !== "string") {
    return "Command description must be a string";
  }
  if (!command.description.trim()) {
    return "Command description cannot be empty";
  }
  return validatePluginCommandName(command.name);
};

const FALLBACK_AGENT_ID = "main";
const DEFAULT_MAIN_SESSION_KEY = "main";
const VALID_AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_AGENT_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

const isGlobalSessionKey = (value: string) => value === "global" || value === "unknown";

const normalizePluginMainKey = (value?: string) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : DEFAULT_MAIN_SESSION_KEY;
};

const normalizePluginAgentId = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return FALLBACK_AGENT_ID;
  }
  if (VALID_AGENT_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_AGENT_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || FALLBACK_AGENT_ID
  );
};

const parsePluginAgentSessionKey = (
  sessionKey: string,
): { agentId: string; rest: string } | null => {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "agent") {
    return null;
  }
  const agentId = parts[1]?.trim();
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
};

const buildPluginAgentMainSessionKey = (params: { agentId: string; mainKey?: string }): string => {
  return `agent:${normalizePluginAgentId(params.agentId)}:${normalizePluginMainKey(params.mainKey)}`;
};

const canonicalizePluginMainSessionAlias = (params: {
  cfg: OpenClawConfig;
  agentId: string;
  sessionKey: string;
}): string => {
  const raw = params.sessionKey.trim();
  if (!raw) {
    return "";
  }
  const normalized = raw.toLowerCase();
  const normalizedAgent = normalizePluginAgentId(params.agentId);
  const normalizedMainKey = normalizePluginMainKey(params.cfg.session?.mainKey);
  const agentMainSessionKey = buildPluginAgentMainSessionKey({
    agentId: normalizedAgent,
    mainKey: normalizedMainKey,
  });
  const agentMainAliasKey = buildPluginAgentMainSessionKey({
    agentId: normalizedAgent,
    mainKey: DEFAULT_MAIN_SESSION_KEY,
  });
  const isAlias =
    normalized === "main" ||
    normalized === normalizedMainKey ||
    normalized === agentMainSessionKey ||
    normalized === agentMainAliasKey;
  if (params.cfg.session?.scope === "global" && isAlias) {
    return "global";
  }
  return isAlias ? agentMainSessionKey : normalized;
};

const resolveDefaultPluginAgentId = (cfg: OpenClawConfig): string => {
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const preferred =
    agents.find((agent) => agent?.default)?.id ??
    agents.find((agent) => typeof agent?.id === "string")?.id ??
    FALLBACK_AGENT_ID;
  return normalizePluginAgentId(preferred);
};

const resolvePluginMainSessionKey = (cfg: OpenClawConfig): string => {
  if (cfg.session?.scope === "global") {
    return "global";
  }
  return buildPluginAgentMainSessionKey({
    agentId: resolveDefaultPluginAgentId(cfg),
    mainKey: cfg.session?.mainKey,
  });
};

const resolveCanonicalPluginSessionKey = (cfg: OpenClawConfig, rawKey: string): string => {
  const trimmedKey = rawKey.trim();
  if (!trimmedKey) {
    return "";
  }
  const lowered = trimmedKey.toLowerCase();
  if (isGlobalSessionKey(lowered)) {
    return lowered;
  }
  const parsed = parsePluginAgentSessionKey(trimmedKey);
  if (parsed) {
    return canonicalizePluginMainSessionAlias({
      cfg,
      agentId: parsed.agentId,
      sessionKey: trimmedKey,
    });
  }
  const normalizedMainKey = normalizePluginMainKey(cfg.session?.mainKey);
  if (lowered === "main" || lowered === normalizedMainKey) {
    return resolvePluginMainSessionKey(cfg);
  }
  if (lowered.startsWith("agent:")) {
    return lowered;
  }
  return `agent:${resolveDefaultPluginAgentId(cfg)}:${lowered}`;
};

const constrainLegacyPromptInjectionHook = (
  handler: PluginHookHandlerMap["before_agent_start"],
): PluginHookHandlerMap["before_agent_start"] => {
  return (event, ctx) => {
    const result = handler(event, ctx);
    if (result && typeof result === "object" && "then" in result) {
      return Promise.resolve(result).then((resolved) =>
        stripPromptMutationFieldsFromLegacyHookResult(resolved),
      );
    }
    return stripPromptMutationFieldsFromLegacyHookResult(result);
  };
};

export function createEmptyPluginRegistry(): PluginRegistry {
  return {
    plugins: [],
    tools: [],
    hooks: [],
    typedHooks: [],
    channels: [],
    channelSetups: [],
    providers: [],
    speechProviders: [],
    mediaUnderstandingProviders: [],
    imageGenerationProviders: [],
    webSearchProviders: [],
    gatewayHandlers: {},
    httpRoutes: [],
    cliRegistrars: [],
    services: [],
    commands: [],
    diagnostics: [],
  };
}

export function createPluginRegistry(registryParams: PluginRegistryParams) {
  const registry = createEmptyPluginRegistry();
  const coreGatewayMethods = new Set(Object.keys(registryParams.coreGatewayHandlers ?? {}));
  const canGatewayHandleSessionReset = coreGatewayMethods.has("sessions.reset");
  const isGatewayRuntimeAvailable = () => {
    const subagentRuntime = registryParams.runtime.subagent;
    return (
      Boolean(subagentRuntime) && !Object.is(subagentRuntime.run, subagentRuntime.deleteSession)
    );
  };
  const runtimeLoadConfig = () => {
    const loadConfig = registryParams.runtime.config?.loadConfig;
    if (typeof loadConfig !== "function") {
      throw new Error("Plugin runtime config loader is unavailable.");
    }
    return loadConfig();
  };
  const gatewayResetUnavailableError =
    "resetSession is only available while the gateway is running.";
  let sessionResetModuleCache: GatewaySessionResetModule | null = null;
  const loadSessionResetModule =
    canGatewayHandleSessionReset && registryParams.loadSessionResetModule
      ? registryParams.loadSessionResetModule
      : canGatewayHandleSessionReset
        ? async () => {
            if (!sessionResetModuleCache) {
              sessionResetModuleCache = await import("../gateway/session-reset-service.js");
            }
            return sessionResetModuleCache;
          }
        : null;
  const resetSessionsInFlight = new Set<string>();

  const pushDiagnostic = (diag: PluginDiagnostic) => {
    registry.diagnostics.push(diag);
  };

  type CommandModule = typeof import("./commands.js");

  type PendingCommandRegistration = {
    record: PluginRecord;
    command: OpenClawPluginCommandDefinition;
    name: string;
  };
  const pendingCommandRegistrations: PendingCommandRegistration[] = [];
  let pendingCommandFlushScheduled = false;

  type CommandModuleState = {
    module?: CommandModule;
    promise?: Promise<CommandModule> | null;
  };
  const commandModuleStateKey = Symbol.for("openclaw.pluginCommandModuleState");
  const commandModuleState = (() => {
    const globalStore = globalThis as typeof globalThis & {
      [commandModuleStateKey]?: CommandModuleState;
    };
    const existing = globalStore[commandModuleStateKey];
    if (existing) {
      return existing;
    }
    const nextState: CommandModuleState = {
      module: undefined,
      promise: null,
    };
    globalStore[commandModuleStateKey] = nextState;
    return nextState;
  })();

  const ensureCommandModuleLoad = () => {
    if (commandModuleState.module || commandModuleState.promise) {
      return commandModuleState.promise;
    }
    commandModuleState.promise = import("./commands.js")
      .then((module) => {
        commandModuleState.module = module;
        return module;
      })
      .finally(() => {
        commandModuleState.promise = null;
      });
    return commandModuleState.promise;
  };

  const finalizeCommandRegistration = (
    record: PluginRecord,
    command: OpenClawPluginCommandDefinition,
    name: string,
  ) => {
    record.commands.push(name);
    registry.commands.push({
      pluginId: record.id,
      pluginName: record.name,
      command,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const flushPendingCommandRegistrations = (commandModule: CommandModule) => {
    if (pendingCommandRegistrations.length === 0) {
      return;
    }

    const pending = pendingCommandRegistrations.splice(0);
    for (const entry of pending) {
      const result = commandModule.registerPluginCommand(entry.record.id, entry.command, {
        pluginName: entry.record.name,
        pluginRoot: entry.record.rootDir,
      });
      if (!result.ok) {
        pushDiagnostic({
          level: "error",
          pluginId: entry.record.id,
          source: entry.record.source,
          message: `command registration failed: ${result.error}`,
        });
        continue;
      }
      finalizeCommandRegistration(entry.record, entry.command, entry.name);
    }
  };

  const handleCommandModuleLoadFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message || "Unknown error" : String(error);
    const pending = pendingCommandRegistrations.splice(0);
    for (const entry of pending) {
      pushDiagnostic({
        level: "error",
        pluginId: entry.record.id,
        source: entry.record.source,
        message: `command registration failed: ${message}`,
      });
    }
  };

  const schedulePendingCommandFlush = () => {
    if (pendingCommandFlushScheduled || pendingCommandRegistrations.length === 0) {
      return;
    }

    const module = commandModuleState.module;
    if (module) {
      pendingCommandFlushScheduled = true;
      try {
        flushPendingCommandRegistrations(module);
      } finally {
        pendingCommandFlushScheduled = false;
      }
      return;
    }

    const modulePromise = ensureCommandModuleLoad();
    if (!modulePromise) {
      return;
    }

    pendingCommandFlushScheduled = true;
    modulePromise
      .then((loadedModule) => {
        flushPendingCommandRegistrations(loadedModule);
      })
      .catch((error) => {
        handleCommandModuleLoadFailure(error);
      })
      .finally(() => {
        pendingCommandFlushScheduled = false;
      });
  };

  if (!registryParams.suppressGlobalCommands) {
    void ensureCommandModuleLoad();
  }

  const normalizeResetSessionError = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message || "Session reset failed.";
    }
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object") {
      const maybeMessage = Reflect.get(error, "message");
      if (typeof maybeMessage === "string" && maybeMessage.trim()) {
        return maybeMessage;
      }
      const nestedError = Reflect.get(error, "error");
      if (nestedError && typeof nestedError === "object") {
        const nestedMessage = Reflect.get(nestedError, "message");
        if (typeof nestedMessage === "string" && nestedMessage.trim()) {
          return nestedMessage;
        }
      }
    }
    return "Session reset failed.";
  };

  const createResetSessionFailure = (
    key: string,
    error: unknown,
  ): Extract<PluginResetSessionResult, { ok: false }> => ({
    ok: false,
    key,
    error: normalizeResetSessionError(error),
  });

  const createPluginResetSession = (params: {
    pluginId: string;
    loadConfig: () => OpenClawConfig;
    loadSessionResetModule: (() => Promise<GatewaySessionResetModule>) | null;
    isGatewayRuntimeAvailable: () => boolean;
  }): NonNullable<OpenClawPluginApi["resetSession"]> => {
    return async (key, reason = "new") => {
      let responseKey = typeof key === "string" ? key.trim() : "";

      try {
        if (typeof key !== "string") {
          throw new TypeError("resetSession key must be a string");
        }

        const trimmedKey = key.trim();
        responseKey = trimmedKey;
        if (!trimmedKey) {
          throw new Error("resetSession key must be a non-empty string");
        }

        if (!params.isGatewayRuntimeAvailable() || !params.loadSessionResetModule) {
          return createResetSessionFailure(trimmedKey, gatewayResetUnavailableError);
        }

        const normalizedReason = reason === "reset" ? "reset" : "new";
        const liveConfig = params.loadConfig();
        const canonicalKey = resolveCanonicalPluginSessionKey(liveConfig, trimmedKey).trim();
        if (!canonicalKey) {
          throw new Error("Session reset failed to resolve a canonical session key");
        }

        responseKey = canonicalKey;
        if (resetSessionsInFlight.has(canonicalKey)) {
          return createResetSessionFailure(
            canonicalKey,
            `Session reset already in progress for ${canonicalKey}.`,
          );
        }

        resetSessionsInFlight.add(canonicalKey);
        try {
          const { performGatewaySessionReset } = await params.loadSessionResetModule();
          const result = await performGatewaySessionReset({
            key: trimmedKey,
            reason: normalizedReason,
            commandSource: `plugin:${params.pluginId}`,
          });

          if (result.ok) {
            return {
              ok: true,
              key: result.key,
              sessionId: result.entry.sessionId,
            };
          }

          return createResetSessionFailure(canonicalKey, result.error);
        } finally {
          resetSessionsInFlight.delete(canonicalKey);
        }
      } catch (error) {
        return createResetSessionFailure(responseKey, error);
      }
    };
  };

  const registerTool = (
    record: PluginRecord,
    tool: AnyAgentTool | OpenClawPluginToolFactory,
    opts?: { name?: string; names?: string[]; optional?: boolean },
  ) => {
    const names = opts?.names ?? (opts?.name ? [opts.name] : []);
    const optional = opts?.optional === true;
    const factory: OpenClawPluginToolFactory =
      typeof tool === "function" ? tool : (_ctx: OpenClawPluginToolContext) => tool;

    if (typeof tool !== "function") {
      names.push(tool.name);
    }

    const normalized = names.map((name) => name.trim()).filter(Boolean);
    if (normalized.length > 0) {
      record.toolNames.push(...normalized);
    }
    registry.tools.push({
      pluginId: record.id,
      pluginName: record.name,
      factory,
      names: normalized,
      optional,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const registerHook = (
    record: PluginRecord,
    events: string | string[],
    handler: Parameters<typeof registerInternalHook>[1],
    opts: OpenClawPluginHookOptions | undefined,
    config: OpenClawPluginApi["config"],
  ) => {
    const eventList = Array.isArray(events) ? events : [events];
    const normalizedEvents = eventList.map((event) => event.trim()).filter(Boolean);
    const entry = opts?.entry ?? null;
    const name = entry?.hook.name ?? opts?.name?.trim();
    if (!name) {
      pushDiagnostic({
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: "hook registration missing name",
      });
      return;
    }
    const existingHook = registry.hooks.find((entry) => entry.entry.hook.name === name);
    if (existingHook) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `hook already registered: ${name} (${existingHook.pluginId})`,
      });
      return;
    }

    const description = entry?.hook.description ?? opts?.description ?? "";
    const hookEntry: HookEntry = entry
      ? {
          ...entry,
          hook: {
            ...entry.hook,
            name,
            description,
            source: "openclaw-plugin",
            pluginId: record.id,
          },
          metadata: {
            ...entry.metadata,
            events: normalizedEvents,
          },
        }
      : {
          hook: {
            name,
            description,
            source: "openclaw-plugin",
            pluginId: record.id,
            filePath: record.source,
            baseDir: path.dirname(record.source),
            handlerPath: record.source,
          },
          frontmatter: {},
          metadata: { events: normalizedEvents },
          invocation: { enabled: true },
        };

    record.hookNames.push(name);
    registry.hooks.push({
      pluginId: record.id,
      entry: hookEntry,
      events: normalizedEvents,
      source: record.source,
    });

    const hookSystemEnabled = config?.hooks?.internal?.enabled === true;
    if (!hookSystemEnabled || opts?.register === false) {
      return;
    }

    for (const event of normalizedEvents) {
      registerInternalHook(event, handler);
    }
  };

  const registerGatewayMethod = (
    record: PluginRecord,
    method: string,
    handler: GatewayRequestHandler,
  ) => {
    const trimmed = method.trim();
    if (!trimmed) {
      return;
    }
    if (coreGatewayMethods.has(trimmed) || registry.gatewayHandlers[trimmed]) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `gateway method already registered: ${trimmed}`,
      });
      return;
    }
    registry.gatewayHandlers[trimmed] = handler;
    record.gatewayMethods.push(trimmed);
  };

  const describeHttpRouteOwner = (entry: PluginHttpRouteRegistration): string => {
    const plugin = entry.pluginId?.trim() || "unknown-plugin";
    const source = entry.source?.trim() || "unknown-source";
    return `${plugin} (${source})`;
  };

  const registerHttpRoute = (record: PluginRecord, params: OpenClawPluginHttpRouteParams) => {
    const normalizedPath = normalizePluginHttpPath(params.path);
    if (!normalizedPath) {
      pushDiagnostic({
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: "http route registration missing path",
      });
      return;
    }
    if (params.auth !== "gateway" && params.auth !== "plugin") {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `http route registration missing or invalid auth: ${normalizedPath}`,
      });
      return;
    }
    const match = params.match ?? "exact";
    const overlappingRoute = findOverlappingPluginHttpRoute(registry.httpRoutes, {
      path: normalizedPath,
      match,
    });
    if (overlappingRoute && overlappingRoute.auth !== params.auth) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message:
          `http route overlap rejected: ${normalizedPath} (${match}, ${params.auth}) ` +
          `overlaps ${overlappingRoute.path} (${overlappingRoute.match}, ${overlappingRoute.auth}) ` +
          `owned by ${describeHttpRouteOwner(overlappingRoute)}`,
      });
      return;
    }
    const existingIndex = registry.httpRoutes.findIndex(
      (entry) => entry.path === normalizedPath && entry.match === match,
    );
    if (existingIndex >= 0) {
      const existing = registry.httpRoutes[existingIndex];
      if (!existing) {
        return;
      }
      if (!params.replaceExisting) {
        pushDiagnostic({
          level: "error",
          pluginId: record.id,
          source: record.source,
          message: `http route already registered: ${normalizedPath} (${match}) by ${describeHttpRouteOwner(existing)}`,
        });
        return;
      }
      if (existing.pluginId && existing.pluginId !== record.id) {
        pushDiagnostic({
          level: "error",
          pluginId: record.id,
          source: record.source,
          message: `http route replacement rejected: ${normalizedPath} (${match}) owned by ${describeHttpRouteOwner(existing)}`,
        });
        return;
      }
      registry.httpRoutes[existingIndex] = {
        pluginId: record.id,
        path: normalizedPath,
        handler: params.handler,
        auth: params.auth,
        match,
        source: record.source,
      };
      return;
    }
    record.httpRoutes += 1;
    registry.httpRoutes.push({
      pluginId: record.id,
      path: normalizedPath,
      handler: params.handler,
      auth: params.auth,
      match,
      source: record.source,
    });
  };

  const registerChannel = (
    record: PluginRecord,
    registration: OpenClawPluginChannelRegistration | ChannelPlugin,
    mode: PluginRegistrationMode = "full",
  ) => {
    const normalized =
      typeof (registration as OpenClawPluginChannelRegistration).plugin === "object"
        ? (registration as OpenClawPluginChannelRegistration)
        : { plugin: registration as ChannelPlugin };
    const plugin = normalized.plugin;
    const id = typeof plugin?.id === "string" ? plugin.id.trim() : String(plugin?.id ?? "").trim();
    if (!id) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: "channel registration missing id",
      });
      return;
    }
    const existingRuntime = registry.channels.find((entry) => entry.plugin.id === id);
    if (mode !== "setup-only" && existingRuntime) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `channel already registered: ${id} (${existingRuntime.pluginId})`,
      });
      return;
    }
    const existingSetup = registry.channelSetups.find((entry) => entry.plugin.id === id);
    if (existingSetup) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `channel setup already registered: ${id} (${existingSetup.pluginId})`,
      });
      return;
    }
    record.channelIds.push(id);
    registry.channelSetups.push({
      pluginId: record.id,
      pluginName: record.name,
      plugin,
      source: record.source,
      enabled: record.enabled,
      rootDir: record.rootDir,
    });
    if (mode === "setup-only") {
      return;
    }
    registry.channels.push({
      pluginId: record.id,
      pluginName: record.name,
      plugin,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const registerProvider = (record: PluginRecord, provider: ProviderPlugin) => {
    const normalizedProvider = normalizeRegisteredProvider({
      pluginId: record.id,
      source: record.source,
      provider,
      pushDiagnostic,
    });
    if (!normalizedProvider) {
      return;
    }
    const id = normalizedProvider.id;
    const existing = registry.providers.find((entry) => entry.provider.id === id);
    if (existing) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `provider already registered: ${id} (${existing.pluginId})`,
      });
      return;
    }
    record.providerIds.push(id);
    registry.providers.push({
      pluginId: record.id,
      pluginName: record.name,
      provider: normalizedProvider,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const registerUniqueProviderLike = <
    T extends { id: string },
    R extends PluginOwnedProviderRegistration<T>,
  >(params: {
    record: PluginRecord;
    provider: T;
    kindLabel: string;
    registrations: R[];
    ownedIds: string[];
  }) => {
    const id = params.provider.id.trim();
    const { record, kindLabel } = params;
    const missingLabel = `${kindLabel} registration missing id`;
    const duplicateLabel = `${kindLabel} already registered: ${id}`;
    if (!id) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: missingLabel,
      });
      return;
    }
    const existing = params.registrations.find((entry) => entry.provider.id === id);
    if (existing) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `${duplicateLabel} (${existing.pluginId})`,
      });
      return;
    }
    params.ownedIds.push(id);
    params.registrations.push({
      pluginId: record.id,
      pluginName: record.name,
      provider: params.provider,
      source: record.source,
      rootDir: record.rootDir,
    } as R);
  };

  const registerSpeechProvider = (record: PluginRecord, provider: SpeechProviderPlugin) => {
    registerUniqueProviderLike({
      record,
      provider,
      kindLabel: "speech provider",
      registrations: registry.speechProviders,
      ownedIds: record.speechProviderIds,
    });
  };

  const registerMediaUnderstandingProvider = (
    record: PluginRecord,
    provider: MediaUnderstandingProviderPlugin,
  ) => {
    registerUniqueProviderLike({
      record,
      provider,
      kindLabel: "media provider",
      registrations: registry.mediaUnderstandingProviders,
      ownedIds: record.mediaUnderstandingProviderIds,
    });
  };

  const registerImageGenerationProvider = (
    record: PluginRecord,
    provider: ImageGenerationProviderPlugin,
  ) => {
    registerUniqueProviderLike({
      record,
      provider,
      kindLabel: "image-generation provider",
      registrations: registry.imageGenerationProviders,
      ownedIds: record.imageGenerationProviderIds,
    });
  };

  const registerWebSearchProvider = (record: PluginRecord, provider: WebSearchProviderPlugin) => {
    registerUniqueProviderLike({
      record,
      provider,
      kindLabel: "web search provider",
      registrations: registry.webSearchProviders,
      ownedIds: record.webSearchProviderIds,
    });
  };

  const registerCli = (
    record: PluginRecord,
    registrar: OpenClawPluginCliRegistrar,
    opts?: { commands?: string[] },
  ) => {
    const commands = (opts?.commands ?? []).map((cmd) => cmd.trim()).filter(Boolean);
    if (commands.length === 0) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: "cli registration missing explicit commands metadata",
      });
      return;
    }
    const existing = registry.cliRegistrars.find((entry) =>
      entry.commands.some((command) => commands.includes(command)),
    );
    if (existing) {
      const overlap = commands.find((command) => existing.commands.includes(command));
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `cli command already registered: ${overlap ?? commands[0]} (${existing.pluginId})`,
      });
      return;
    }
    record.cliCommands.push(...commands);
    registry.cliRegistrars.push({
      pluginId: record.id,
      pluginName: record.name,
      register: registrar,
      commands,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const registerService = (record: PluginRecord, service: OpenClawPluginService) => {
    const id = service.id.trim();
    if (!id) {
      return;
    }
    const existing = registry.services.find((entry) => entry.service.id === id);
    if (existing) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `service already registered: ${id} (${existing.pluginId})`,
      });
      return;
    }
    record.services.push(id);
    registry.services.push({
      pluginId: record.id,
      pluginName: record.name,
      service,
      source: record.source,
      rootDir: record.rootDir,
    });
  };

  const registerCommand = (record: PluginRecord, command: OpenClawPluginCommandDefinition) => {
    const name = command.name.trim();
    if (!name) {
      pushDiagnostic({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: "command registration missing name",
      });
      return;
    }

    // For snapshot (non-activating) loads, record the command locally without touching the
    // global plugin command registry so running gateway commands stay intact.
    // We still validate the command definition so diagnostics match the real activation path.
    // NOTE: cross-plugin duplicate command detection is intentionally skipped here because
    // snapshot registries are isolated and never write to the global command table. Conflicts
    // will surface when the plugin is loaded via the normal activation path at gateway startup.
    if (registryParams.suppressGlobalCommands) {
      const validationError = validatePluginCommandDefinitionLocal(command);
      if (validationError) {
        pushDiagnostic({
          level: "error",
          pluginId: record.id,
          source: record.source,
          message: `command registration failed: ${validationError}`,
        });
        return;
      }
      finalizeCommandRegistration(record, command, name);
      return;
    }

    pendingCommandRegistrations.push({ record, command, name });
    schedulePendingCommandFlush();
  };

  const registerTypedHook = <K extends PluginHookName>(
    record: PluginRecord,
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
    policy?: PluginTypedHookPolicy,
  ) => {
    if (!isPluginHookName(hookName)) {
      pushDiagnostic({
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: `unknown typed hook "${String(hookName)}" ignored`,
      });
      return;
    }
    let effectiveHandler = handler;
    if (policy?.allowPromptInjection === false && isPromptInjectionHookName(hookName)) {
      if (hookName === "before_prompt_build") {
        pushDiagnostic({
          level: "warn",
          pluginId: record.id,
          source: record.source,
          message: `typed hook "${hookName}" blocked by plugins.entries.${record.id}.hooks.allowPromptInjection=false`,
        });
        return;
      }
      if (hookName === "before_agent_start") {
        pushDiagnostic({
          level: "warn",
          pluginId: record.id,
          source: record.source,
          message: `typed hook "${hookName}" prompt fields constrained by plugins.entries.${record.id}.hooks.allowPromptInjection=false`,
        });
        effectiveHandler = constrainLegacyPromptInjectionHook(
          handler as PluginHookHandlerMap["before_agent_start"],
        ) as PluginHookHandlerMap[K];
      }
    }
    record.hookCount += 1;
    registry.typedHooks.push({
      pluginId: record.id,
      hookName,
      handler: effectiveHandler,
      priority: opts?.priority,
      source: record.source,
    } as TypedPluginHookRegistration);
  };

  const normalizeLogger = (logger: PluginLogger): PluginLogger => ({
    info: logger.info,
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug,
  });

  const createApi = (
    record: PluginRecord,
    params: {
      config: OpenClawPluginApi["config"];
      pluginConfig?: Record<string, unknown>;
      hookPolicy?: PluginTypedHookPolicy;
      registrationMode?: PluginRegistrationMode;
    },
  ): OpenClawPluginApi => {
    const registrationMode = params.registrationMode ?? "full";
    return {
      id: record.id,
      name: record.name,
      version: record.version,
      description: record.description,
      source: record.source,
      rootDir: record.rootDir,
      registrationMode,
      config: params.config,
      pluginConfig: params.pluginConfig,
      runtime: registryParams.runtime,
      logger: normalizeLogger(registryParams.logger),
      registerTool:
        registrationMode === "full" ? (tool, opts) => registerTool(record, tool, opts) : () => {},
      registerHook:
        registrationMode === "full"
          ? (events, handler, opts) => registerHook(record, events, handler, opts, params.config)
          : () => {},
      registerHttpRoute:
        registrationMode === "full" ? (params) => registerHttpRoute(record, params) : () => {},
      registerChannel: (registration) => registerChannel(record, registration, registrationMode),
      registerProvider:
        registrationMode === "full" ? (provider) => registerProvider(record, provider) : () => {},
      registerSpeechProvider:
        registrationMode === "full"
          ? (provider) => registerSpeechProvider(record, provider)
          : () => {},
      registerMediaUnderstandingProvider:
        registrationMode === "full"
          ? (provider) => registerMediaUnderstandingProvider(record, provider)
          : () => {},
      registerImageGenerationProvider:
        registrationMode === "full"
          ? (provider) => registerImageGenerationProvider(record, provider)
          : () => {},
      registerWebSearchProvider:
        registrationMode === "full"
          ? (provider) => registerWebSearchProvider(record, provider)
          : () => {},
      registerGatewayMethod:
        registrationMode === "full"
          ? (method, handler) => registerGatewayMethod(record, method, handler)
          : () => {},
      registerCli:
        registrationMode === "full"
          ? (registrar, opts) => registerCli(record, registrar, opts)
          : () => {},
      registerService:
        registrationMode === "full" ? (service) => registerService(record, service) : () => {},
      registerInteractiveHandler:
        registrationMode === "full"
          ? (registration) => {
              const result = registerPluginInteractiveHandler(record.id, registration, {
                pluginName: record.name,
                pluginRoot: record.rootDir,
              });
              if (!result.ok) {
                pushDiagnostic({
                  level: "warn",
                  pluginId: record.id,
                  source: record.source,
                  message: result.error ?? "interactive handler registration failed",
                });
              }
            }
          : () => {},
      registerCommand:
        registrationMode === "full" ? (command) => registerCommand(record, command) : () => {},
      registerContextEngine: (id, factory) => {
        if (registrationMode !== "full") {
          return;
        }
        if (id === defaultSlotIdForKey("contextEngine")) {
          pushDiagnostic({
            level: "error",
            pluginId: record.id,
            source: record.source,
            message: `context engine id reserved by core: ${id}`,
          });
          return;
        }
        const result = registerContextEngineForOwner(id, factory, `plugin:${record.id}`, {
          allowSameOwnerRefresh: true,
        });
        if (!result.ok) {
          pushDiagnostic({
            level: "error",
            pluginId: record.id,
            source: record.source,
            message: `context engine already registered: ${id} (${result.existingOwner})`,
          });
        }
      },
      resetSession:
        registrationMode === "full"
          ? createPluginResetSession({
              pluginId: record.id,
              loadConfig: runtimeLoadConfig,
              loadSessionResetModule,
              isGatewayRuntimeAvailable,
            })
          : undefined,
      resolvePath: (input: string) => resolveUserPath(input),
      on: (hookName, handler, opts) =>
        registrationMode === "full"
          ? registerTypedHook(record, hookName, handler, opts, params.hookPolicy)
          : undefined,
    };
  };

  return {
    registry,
    createApi,
    pushDiagnostic,
    registerTool,
    registerChannel,
    registerProvider,
    registerSpeechProvider,
    registerMediaUnderstandingProvider,
    registerImageGenerationProvider,
    registerWebSearchProvider,
    registerGatewayMethod,
    registerCli,
    registerService,
    registerCommand,
    registerHook,
    registerTypedHook,
  };
}
