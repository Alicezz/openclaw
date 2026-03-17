import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import { buildTelegramTopicStatusLines } from "./commands-status.js";

function buildTelegramTopicContext(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    OriginatingChannel: "telegram",
    Provider: "telegram",
    Surface: "telegram",
    OriginatingTo: "telegram:-1001234567890",
    To: "telegram:-1001234567890",
    AccountId: "default",
    MessageThreadId: 42,
    ...overrides,
  } as MsgContext;
}

function buildAcpSessionEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: "sess-topic",
    updatedAt: 1,
    acp: {
      backend: "acpx",
      agent: "codex",
      runtimeSessionName: "topic-42",
      mode: "persistent",
      state: "idle",
      lastActivityAt: 1,
      identity: {
        state: "resolved",
        source: "status",
        lastUpdatedAt: 1,
        acpxSessionId: "sid-topic-42",
      },
    },
    ...overrides,
  };
}

describe("buildTelegramTopicStatusLines", () => {
  it("describes configured ACP topic bindings", () => {
    const lines = buildTelegramTopicStatusLines(
      {
        cfg: {} as OpenClawConfig,
        ctx: buildTelegramTopicContext(),
        command: { to: undefined },
        sessionEntry: buildAcpSessionEntry(),
      },
      {
        resolveConfiguredBinding: () => ({
          spec: {
            channel: "telegram",
            accountId: "default",
            conversationId: "-1001234567890:topic:42",
            parentConversationId: "-1001234567890",
            agentId: "codex",
            mode: "persistent",
            backend: "acpx",
          },
          record: {
            bindingId: "config:acp:telegram:default:-1001234567890:topic:42",
            targetSessionKey: "agent:codex:acp:binding:telegram:default:feedface",
            targetKind: "session",
            conversation: {
              channel: "telegram",
              accountId: "default",
              conversationId: "-1001234567890:topic:42",
              parentConversationId: "-1001234567890",
            },
            status: "active",
            boundAt: 0,
          },
        }),
        sessionBindingService: {
          resolveByConversation: () => null,
        },
      },
    );

    expect(lines).toEqual([
      "📍 Topic: -1001234567890:topic:42",
      "🚚 Delivery: telegram:-1001234567890 · topic 42",
      "🗂 Configured: ACP (persistent · acpx) -> agent:codex:acp:binding:telegram:default:feedface",
      "🛰 ACP: acpx · persistent · idle · id=sid-topic-42",
    ]);
  });

  it("shows live focused bindings when present", () => {
    const lines = buildTelegramTopicStatusLines(
      {
        cfg: {} as OpenClawConfig,
        ctx: buildTelegramTopicContext(),
        command: { to: undefined },
      },
      {
        resolveConfiguredBinding: () => null,
        sessionBindingService: {
          resolveByConversation: () => ({
            bindingId: "default:-1001234567890:topic:42",
            targetSessionKey: "agent:codex-acp:session-1",
            targetKind: "session",
            conversation: {
              channel: "telegram",
              accountId: "default",
              conversationId: "-1001234567890:topic:42",
            },
            status: "active",
            boundAt: 0,
          }),
        },
      },
    );

    expect(lines).toContain("🧷 Live: focused session (active) -> agent:codex-acp:session-1");
    expect(lines).not.toContain(expect.stringContaining("Configured: ACP"));
  });

  it("shows configured and live bindings side by side when they drift", () => {
    const lines = buildTelegramTopicStatusLines(
      {
        cfg: {} as OpenClawConfig,
        ctx: buildTelegramTopicContext(),
        command: { to: undefined },
        sessionEntry: buildAcpSessionEntry(),
      },
      {
        resolveConfiguredBinding: () => ({
          spec: {
            channel: "telegram",
            accountId: "default",
            conversationId: "-1001234567890:topic:42",
            parentConversationId: "-1001234567890",
            agentId: "codex",
            mode: "persistent",
            backend: "acpx",
          },
          record: {
            bindingId: "config:acp:telegram:default:-1001234567890:topic:42",
            targetSessionKey: "agent:codex:acp:binding:telegram:default:feedface",
            targetKind: "session",
            conversation: {
              channel: "telegram",
              accountId: "default",
              conversationId: "-1001234567890:topic:42",
              parentConversationId: "-1001234567890",
            },
            status: "active",
            boundAt: 0,
          },
        }),
        sessionBindingService: {
          resolveByConversation: () => ({
            bindingId: "default:-1001234567890:topic:42",
            targetSessionKey: "agent:codex-acp:session-live",
            targetKind: "session",
            conversation: {
              channel: "telegram",
              accountId: "default",
              conversationId: "-1001234567890:topic:42",
            },
            status: "active",
            boundAt: 0,
          }),
        },
      },
    );

    expect(lines).toContain(
      "🗂 Configured: ACP (persistent · acpx) -> agent:codex:acp:binding:telegram:default:feedface",
    );
    expect(lines).toContain("🧷 Live: focused session (active) -> agent:codex-acp:session-live");
    expect(lines).toContain("⚠️ Drift: configured target differs from live binding");
  });

  it("skips non-topic telegram conversations", () => {
    const lines = buildTelegramTopicStatusLines({
      cfg: {} as OpenClawConfig,
      ctx: buildTelegramTopicContext({ MessageThreadId: undefined }),
      command: { to: undefined },
    });

    expect(lines).toEqual([]);
  });
});
