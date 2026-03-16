/**
 * ZK Handoff Live Demo
 *
 * Run with:   pnpm tsx scripts/zk-demo.ts
 *   or:       bunx tsx scripts/zk-demo.ts
 *
 * Shows the complete zero-knowledge handoff between two simulated agents:
 *   planner-agent  ──(ZK capsule)──►  researcher-agent
 *
 * Every ZK audit event is printed in real-time with a colour-coded display.
 */

import { randomBytes } from "node:crypto";
import {
  createHandoffCapsule,
  receiveHandoffCapsule,
  HandoffNonceRegistry,
} from "../src/agents/zk-handoff.js";
import {
  issueAccessPolicy,
  AccessWitnessRecorder,
  verifyAccessProof,
} from "../src/infra/zk-agent-trust.js";
import { onZkAuditEvent, type DiagnosticZkEvent } from "../src/infra/zk-audit-events.js";

// ── ANSI colour helpers ──────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

function box(title: string, color: string): void {
  const bar = "─".repeat(60);
  console.log(`\n${color}${C.bold}┌${bar}┐${C.reset}`);
  console.log(`${color}${C.bold}│  ${title.padEnd(58)}│${C.reset}`);
  console.log(`${color}${C.bold}└${bar}┘${C.reset}`);
}

function label(name: string, value: string, color = C.white): void {
  console.log(`  ${C.dim}${name.padEnd(22)}${C.reset}${color}${value}${C.reset}`);
}

// ── ZK Audit Event Renderer ──────────────────────────────────────────────────
function renderZkEvent(ev: DiagnosticZkEvent): void {
  const ts = new Date().toISOString().slice(11, 23);

  switch (ev.type) {
    case "zk.policy.issued":
      box(`[${ts}] 🔐 ZK POLICY ISSUED`, C.cyan);
      label("agentId", ev.agentId, C.cyan);
      label("sessionId", ev.sessionId, C.cyan);
      label("policyRoot", ev.policyRoot.slice(0, 16) + "…", C.dim);
      label("resources", ev.resourceCount.toString(), C.white);
      label("expiresAt", new Date(ev.expiresAt).toLocaleTimeString(), C.dim);
      break;

    case "zk.proof.generated":
      box(`[${ts}] 🧮 ZK PROOF GENERATED`, C.blue);
      label("agentId", ev.agentId, C.blue);
      label("sessionId", ev.sessionId, C.blue);
      label("numAccesses", ev.numAccesses.toString(), C.white);
      label("accessRoot", ev.accessRoot.slice(0, 16) + "…", C.dim);
      label("policyRoot", ev.policyRoot.slice(0, 16) + "…", C.dim);
      label("durationMs", `${ev.durationMs}ms`, C.dim);
      break;

    case "zk.proof.verified":
      if (ev.valid) {
        box(`[${ts}] ✅ ZK PROOF VERIFIED`, C.green);
        label("agentId", ev.agentId, C.green);
        label("sessionId", ev.sessionId, C.green);
        label("valid", "true", C.green);
        label("durationMs", `${ev.durationMs}ms`, C.dim);
      } else {
        box(`[${ts}] ❌ ZK PROOF FAILED`, C.red);
        label("agentId", ev.agentId, C.red);
        label("reason", ev.reason ?? "unknown", C.red);
        label("durationMs", `${ev.durationMs}ms`, C.dim);
      }
      break;

    case "zk.handoff.created":
      box(`[${ts}] 📦 ZK HANDOFF CAPSULE CREATED`, C.magenta);
      label("sender", ev.senderAgentId, C.magenta);
      label("receiver", ev.receiverAgentId, C.magenta);
      label("task", ev.taskLabel, C.white);
      label("nonce (prefix)", ev.handoffNonce.slice(0, 16) + "…", C.dim);
      label(
        "hasAccessProof",
        ev.hasAccessProof ? "yes" : "no",
        ev.hasAccessProof ? C.green : C.yellow,
      );
      label("expiresAt", new Date(ev.expiresAt).toLocaleTimeString(), C.dim);
      break;

    case "zk.handoff.received":
      if (ev.valid) {
        box(`[${ts}] 🔓 ZK HANDOFF ACCEPTED`, C.green);
        label("sender", ev.senderAgentId, C.green);
        label("receiver", ev.receiverAgentId, C.green);
        label("nonce (prefix)", ev.handoffNonce.slice(0, 16) + "…", C.dim);
        label("durationMs", `${ev.durationMs}ms`, C.green);
      } else {
        box(`[${ts}] 🚫 ZK HANDOFF REJECTED`, C.red);
        label("sender", ev.senderAgentId, C.red);
        label("receiver", ev.receiverAgentId, C.red);
        label("reason", ev.reason ?? "unknown", C.red);
        label("durationMs", `${ev.durationMs}ms`, C.dim);
      }
      break;

    case "zk.handoff.replay":
      box(`[${ts}] ⚠️  REPLAY ATTACK DETECTED`, C.yellow);
      label("nonce (prefix)", ev.handoffNonce.slice(0, 16) + "…", C.yellow);
      label("receiver", ev.receiverAgentId, C.yellow);
      break;
  }
}

// ── Demo ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}OpenClaw ZK Handoff Demo${C.reset}`);
  console.log(`${C.dim}Simulating: planner-agent  ──(ZK capsule)──►  researcher-agent${C.reset}`);

  // Subscribe to all ZK audit events before anything fires.
  const unsubscribe = onZkAuditEvent(renderZkEvent);

  // ── Shared gateway key (in prod: derived from gateway's master secret) ──
  const gatewayKey = randomBytes(32);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1:  Gateway issues an access policy for the planner agent.
  //          The agent may access three resources.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 1 — Gateway issues access policy to planner-agent${C.reset}`);
  await sleep(300);

  const allowedResources = ["research:web-search", "research:summarise", "messages:read"];
  const policy = issueAccessPolicy({
    agentId: "planner-agent",
    sessionId: "session-abc123",
    allowedResources,
    gatewayKey,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2:  Planner agent records the resources it actually accessed.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 2 — planner-agent records its accesses${C.reset}`);
  await sleep(300);

  const recorder = new AccessWitnessRecorder("planner-agent", "session-abc123");
  recorder.record("research:web-search");
  recorder.record("research:summarise");
  // NOTE: "messages:read" was in policy but not used — zero-knowledge!

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3:  Planner generates an access proof (commitment without revealing accesses).
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 3 — planner-agent generates ZK access proof${C.reset}`);
  await sleep(300);

  const accessProof = recorder.generateProof(policy, gatewayKey, allowedResources);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4:  Planner creates a handoff capsule for researcher-agent.
  //          Context is AES-256-GCM encrypted; proof is attached for auditors.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    `\n${C.bold}STEP 4 — planner-agent creates handoff capsule for researcher-agent${C.reset}`,
  );
  await sleep(300);

  const capsule = createHandoffCapsule({
    senderAgentId: "planner-agent",
    receiverAgentId: "researcher-agent",
    task: "Summarise the top 5 recent AI papers and draft a 3-sentence briefing for the user.",
    taskLabel: "AI paper briefing",
    state: {
      searchResults: ["paper:2501.001", "paper:2501.002"],
      draftOutline: ["Introduction", "Key findings", "Recommendations"],
    },
    authorizedChannelIds: ["imessage:user-session"],
    authorizedResourceIds: allowedResources,
    gatewayKey,
    accessProof,
    ttlMs: 60_000,
  });

  console.log(`\n  ${C.dim}Capsule header (safe to log — no secrets):${C.reset}`);
  console.log(
    `  ${C.dim}${JSON.stringify(capsule.header, null, 2).replace(/\n/g, "\n  ")}${C.reset}`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5:  Researcher-agent receives and verifies the capsule.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 5 — researcher-agent verifies and opens the capsule${C.reset}`);
  await sleep(300);

  // Also verify the access proof the sender attached.
  console.log(`\n  ${C.dim}Verifying attached access proof…${C.reset}`);
  await sleep(200);
  verifyAccessProof(accessProof, gatewayKey, policy);

  const nonceRegistry = new HandoffNonceRegistry();

  // Check for replay first.
  const isReplay = nonceRegistry.checkAndRegister(
    capsule.header.handoffNonce,
    capsule.header.expiresAt,
    "researcher-agent",
  );

  if (isReplay) {
    console.log(`${C.red}  ✗ Replay detected! Rejecting capsule.${C.reset}`);
  } else {
    const result = receiveHandoffCapsule(capsule, "researcher-agent", gatewayKey);

    if (result.valid) {
      console.log(`\n  ${C.green}${C.bold}Context successfully decrypted:${C.reset}`);
      console.log(`  ${C.dim}task:${C.reset} ${result.context.task}`);
      console.log(
        `  ${C.dim}state keys:${C.reset} ${Object.keys(result.context.state as object).join(", ")}`,
      );
      console.log(
        `  ${C.dim}authorizedChannels:${C.reset} ${result.context.authorizedChannelIds.join(", ")}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6 (bonus): Replay attack — same nonce rejected.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 6 — Replay attack: submit the same capsule again${C.reset}`);
  await sleep(300);

  nonceRegistry.checkAndRegister(
    capsule.header.handoffNonce,
    capsule.header.expiresAt,
    "researcher-agent",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7 (bonus): Tampered capsule — wrong receiver.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}STEP 7 — Wrong receiver: impersonation attempt${C.reset}`);
  await sleep(300);

  receiveHandoffCapsule(capsule, "evil-agent", gatewayKey);

  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.green}Demo complete.${C.reset}\n`);
  unsubscribe();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
