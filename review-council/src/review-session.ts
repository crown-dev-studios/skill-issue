import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export interface ReviewPaths {
  rootDir: string;
  runDir: string;
  claudeDir: string;
  codexDir: string;
  judgeDir: string;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  const [day, time] = iso.split("T");
  const datePart = day.replaceAll("-", "");
  const timePart = time.replace("Z", "").replaceAll(":", "").replace(".", "");
  return `${datePart}-${timePart}`;
}

export function normalizeReviewTarget(target: string): string {
  return normalizeWhitespace(target);
}

export function createRunId(date: Date = new Date(), uuid: string = randomUUID()): string {
  const suffix = uuid.replaceAll("-", "").slice(0, 8).toLowerCase();
  return `${formatTimestamp(date)}-${suffix}`;
}

export function buildReviewPaths(cwd: string, runId: string, explicitRunDir?: string): ReviewPaths {
  const rootDir = resolve(cwd, "docs", "reviews");
  const runDir = explicitRunDir ? resolve(explicitRunDir) : resolve(rootDir, runId);

  return {
    rootDir,
    runDir,
    claudeDir: resolve(runDir, "claude"),
    codexDir: resolve(runDir, "codex"),
    judgeDir: resolve(runDir, "judge"),
  };
}
