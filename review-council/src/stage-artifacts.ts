import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StageName } from "./stage-runtime.js";

export type RuntimeState =
  | "starting"
  | "running"
  | "validating"
  | "complete"
  | "failed"
  | "timed_out"
  | "exited";

export interface RuntimeSnapshotState {
  stage: StageName;
  runtime_state: RuntimeState;
  pid: number | undefined;
  started_at: string;
  heartbeat_at: string | undefined;
  last_stdout_at: string | undefined;
  last_stderr_at: string | undefined;
}

function ensureDir(filepath: string): void {
  mkdirSync(dirname(filepath), { recursive: true });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function appendRuntimeEvent(
  eventsPath: string,
  event: unknown,
  warnings: string[],
): void {
  try {
    ensureDir(eventsPath);
    appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    warnings.push(`Failed to append runtime event to ${eventsPath}: ${describeError(error)}`);
  }
}

export function writeRuntimeSnapshot(
  runtimePath: string,
  snapshot: RuntimeSnapshotState,
  warnings: string[],
): void {
  try {
    ensureDir(runtimePath);
    writeFileSync(runtimePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  } catch (error) {
    warnings.push(`Failed to write runtime snapshot to ${runtimePath}: ${describeError(error)}`);
  }
}
