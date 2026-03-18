import { EventEmitter } from "node:events";
import { registerUnhandledRejectionHandler } from "../../infra/unhandled-rejections.js";
import { isCompactionFailureError } from "../pi-embedded-helpers.js";
import { log } from "./logger.js";
import { describeUnknownError } from "./utils.js";

const compactionFailureEmitter = new EventEmitter();

export type CompactionFailureListener = (reason: string) => void;

export function onUnhandledCompactionFailure(cb: CompactionFailureListener): () => void {
  compactionFailureEmitter.on("failure", cb);
  return () => compactionFailureEmitter.off("failure", cb);
}

registerUnhandledRejectionHandler((reason) => {
  const message = describeUnknownError(reason);
  if (!isCompactionFailureError(message)) {
    return false;
  }
  log.error(`Auto-compaction failed (unhandled): ${message}`);
  compactionFailureEmitter.emit("failure", message);
  return true;
});
