function normalizeConversationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveScopedConversationTarget(value: string): string | undefined {
  const trimmed = normalizeConversationId(value);
  if (!trimmed) {
    return undefined;
  }
  const matrixScoped = trimmed.toLowerCase().startsWith("matrix:")
    ? trimmed.slice("matrix:".length).trim()
    : trimmed;
  for (const prefix of ["channel:", "room:"]) {
    if (!matrixScoped.startsWith(prefix)) {
      continue;
    }
    const conversationId = normalizeConversationId(matrixScoped.slice(prefix.length));
    if (conversationId) {
      return conversationId;
    }
  }
  return undefined;
}

export function resolveConversationIdFromTargets(params: {
  threadId?: string | number;
  targets: Array<string | undefined | null>;
}): string | undefined {
  const threadId =
    params.threadId != null ? normalizeConversationId(String(params.threadId)) : undefined;
  if (threadId) {
    return threadId;
  }

  for (const rawTarget of params.targets) {
    const target = normalizeConversationId(rawTarget);
    if (!target) {
      continue;
    }
    const scopedConversationId = resolveScopedConversationTarget(target);
    if (scopedConversationId) {
      return scopedConversationId;
    }
    const mentionMatch = target.match(/^<#(\d+)>$/);
    if (mentionMatch?.[1]) {
      return mentionMatch[1];
    }
    if (/^\d{6,}$/.test(target)) {
      return target;
    }
  }

  return undefined;
}
