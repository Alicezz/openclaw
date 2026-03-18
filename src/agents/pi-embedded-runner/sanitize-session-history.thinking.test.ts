import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { makeAgentAssistantMessage } from "../test-helpers/agent-message-fixtures.js";
import { sanitizeSessionHistory } from "./transcript-hygiene.js";

describe("sanitizeSessionHistory thinking stripping", () => {
  it("strips latest thinking blocks for non-Anthropic providers that reject replayed thinking", async () => {
    const sm = SessionManager.inMemory();
    const messages: AgentMessage[] = [
      makeAgentAssistantMessage({
        provider: "github-copilot",
        model: "claude-3.7-sonnet",
        api: "openai-completions",
        content: [
          { type: "thinking", thinking: "internal" },
          { type: "text", text: "final answer" },
        ],
        timestamp: 1,
      }),
    ];

    const sanitized = await sanitizeSessionHistory({
      messages,
      modelApi: "openai-completions",
      provider: "github-copilot",
      modelId: "claude-3.7-sonnet",
      sessionManager: sm,
      sessionId: "test",
    });

    expect(sanitized).not.toBe(messages);
    const assistant = sanitized.find(
      (message): message is Extract<AgentMessage, { role: "assistant" }> =>
        Boolean(message && typeof message === "object" && message.role === "assistant"),
    );
    expect(assistant?.content).toEqual([{ type: "text", text: "final answer" }]);
  });
});
