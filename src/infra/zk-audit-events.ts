/**
 * ZK Audit Events — typed diagnostic events for the zero-knowledge access
 * proof and handoff subsystems.
 *
 * These are emitted via emitZkAuditEvent() and can be consumed alongside
 * the standard diagnostic events.  Consumers subscribe with onZkAuditEvent()
 * and filter on the "zk.*" type prefix.
 *
 * Security note: no secrets, plaintexts, or cryptographic keys are ever
 * included in these events — only hashes, roots, and outcome flags.
 */

import type { DiagnosticEventPayload } from "./diagnostic-events.js";
import { emitDiagnosticEvent, onDiagnosticEvent } from "./diagnostic-events.js";

// ─────────────────────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────────────────────

type DiagnosticBaseEvent = {
  ts: number;
  seq: number;
};

/**
 * Emitted by the gateway when it issues a new access policy for an agent.
 */
export type DiagnosticZkPolicyIssuedEvent = DiagnosticBaseEvent & {
  type: "zk.policy.issued";
  agentId: string;
  sessionId: string;
  /** Merkle root over allowed resource hashes — safe to log. */
  policyRoot: string;
  /** Number of resources in the policy. */
  resourceCount: number;
  /** Policy expiry (Unix ms). */
  expiresAt: number;
};

/**
 * Emitted when an agent generates an access proof at the end of a session.
 */
export type DiagnosticZkProofGeneratedEvent = DiagnosticBaseEvent & {
  type: "zk.proof.generated";
  agentId: string;
  sessionId: string;
  /** Merkle root over access commitments. */
  accessRoot: string;
  /** Merkle root from the policy used. */
  policyRoot: string;
  /** Number of resource accesses recorded. */
  numAccesses: number;
  /** Proof mechanism: "commitment-v1" | "snark-groth16" | "snark-plonk". */
  proofType: string;
  /** Wall-clock duration of proof generation in milliseconds. */
  durationMs: number;
};

/**
 * Emitted when a verifier (gateway or auditor) verifies an access proof.
 */
export type DiagnosticZkProofVerifiedEvent = DiagnosticBaseEvent & {
  type: "zk.proof.verified";
  agentId: string;
  sessionId: string;
  valid: boolean;
  /** Failure reason when valid=false; omitted on success. */
  reason?: string;
  proofType: string;
  /** Wall-clock duration of proof verification in milliseconds. */
  durationMs: number;
};

/**
 * Emitted by the sender when a handoff capsule is created.
 */
export type DiagnosticZkHandoffCreatedEvent = DiagnosticBaseEvent & {
  type: "zk.handoff.created";
  senderAgentId: string;
  receiverAgentId: string;
  /** SHA-256 of the task text — not the task itself. */
  taskHash: string;
  /** Human-readable routing label (no PII). */
  taskLabel: string;
  /** Per-handoff nonce for correlation across sender/receiver events. */
  handoffNonce: string;
  /** Whether an AccessProof was attached for auditability. */
  hasAccessProof: boolean;
  /** Capsule expiry (Unix ms). */
  expiresAt: number;
};

/**
 * Emitted by the receiver when a handoff capsule is processed.
 */
export type DiagnosticZkHandoffReceivedEvent = DiagnosticBaseEvent & {
  type: "zk.handoff.received";
  senderAgentId: string;
  receiverAgentId: string;
  /** Correlates with the corresponding zk.handoff.created event. */
  handoffNonce: string;
  valid: boolean;
  /** Failure reason when valid=false; omitted on success. */
  reason?: string;
  /** Wall-clock duration of verification + decryption in milliseconds. */
  durationMs: number;
};

/**
 * Emitted when a replay attack is detected — a handoff nonce was resubmitted.
 * This is a security signal and should be treated as a warning or alert.
 */
export type DiagnosticZkHandoffReplayEvent = DiagnosticBaseEvent & {
  type: "zk.handoff.replay";
  /** The replayed nonce. */
  handoffNonce: string;
  receiverAgentId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Union augmentation helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All ZK-specific diagnostic event types in a single union.
 * Import this alongside DiagnosticEventPayload when you need to handle both.
 */
export type DiagnosticZkEvent =
  | DiagnosticZkPolicyIssuedEvent
  | DiagnosticZkProofGeneratedEvent
  | DiagnosticZkProofVerifiedEvent
  | DiagnosticZkHandoffCreatedEvent
  | DiagnosticZkHandoffReceivedEvent
  | DiagnosticZkHandoffReplayEvent;

/**
 * Full event payload union including ZK events.
 * Use this when subscribing to events that may include ZK audit events.
 */
export type DiagnosticEventPayloadWithZk = DiagnosticEventPayload | DiagnosticZkEvent;

/**
 * Narrow an event to the ZK subset.
 */
export function isZkEvent(
  event: DiagnosticEventPayload | DiagnosticZkEvent,
): event is DiagnosticZkEvent {
  return (event as DiagnosticZkEvent).type.startsWith("zk.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit/subscribe helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distributive Omit over the ZK event union — mirrors the DiagnosticEventInput
 * pattern in diagnostic-events.ts so each union member loses only "ts"/"seq".
 */
type DiagnosticZkEventInput = DiagnosticZkEvent extends infer Event
  ? Event extends DiagnosticZkEvent
    ? Omit<Event, "ts" | "seq">
    : never
  : never;

/**
 * Emit a ZK audit event through the shared diagnostic event bus.
 * The cast to `never` is intentional: the ZK event types are not (yet) in the
 * DiagnosticEventPayload union, so we push them through as opaque payloads that
 * listeners can type-narrow with isZkEvent().
 */
export function emitZkAuditEvent(event: DiagnosticZkEventInput): void {
  emitDiagnosticEvent(event as never);
}

/**
 * Subscribe to ZK audit events only.
 * Returns an unsubscribe function.
 */
export function onZkAuditEvent(listener: (event: DiagnosticZkEvent) => void): () => void {
  return onDiagnosticEvent((event) => {
    if (isZkEvent(event)) {
      listener(event);
    }
  });
}
