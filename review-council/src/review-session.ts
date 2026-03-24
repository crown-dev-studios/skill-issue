import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export interface ReviewPaths {
  rootDir: string;
  reviewDir: string;
  runsDir: string;
  runDir: string;
  claudeDir: string;
  codexDir: string;
  judgeDir: string;
}

export const REVIEW_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;

function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function normalizeWhitespace(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function slugify(value: string, maxLength: number = 48): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");

  if (!slug) {
    return "review";
  }

  return slug.slice(0, maxLength).replaceAll(/-+$/g, "") || "review";
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

export function deriveReviewId(cwd: string, target: string): string {
  const normalizedRoot = realpathOrResolve(cwd);
  const normalizedTarget = normalizeReviewTarget(target).toLowerCase();
  const hash = createHash("sha1")
    .update(normalizedRoot)
    .update("\n")
    .update(normalizedTarget)
    .digest("hex")
    .slice(0, 12);
  const targetSlug = slugify(normalizedTarget);
  return `${targetSlug}-${hash}`;
}

export function validateReviewId(reviewId: string): string | null {
  if (!REVIEW_ID_PATTERN.test(reviewId)) {
    return "Review IDs must match /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/";
  }
  return null;
}

export function createRunId(date: Date = new Date(), uuid: string = randomUUID()): string {
  const suffix = uuid.replaceAll("-", "").slice(0, 8).toLowerCase();
  return `${formatTimestamp(date)}-${suffix}`;
}

export function buildReviewPaths(cwd: string, reviewId: string, runId: string, explicitRunDir?: string): ReviewPaths {
  const rootDir = resolve(cwd, "docs", "reviews");
  const reviewDir = resolve(rootDir, reviewId);
  const runsDir = resolve(reviewDir, "runs");
  const runDir = explicitRunDir ? resolve(explicitRunDir) : resolve(runsDir, runId);

  return {
    rootDir,
    reviewDir,
    runsDir,
    runDir,
    claudeDir: resolve(runDir, "claude"),
    codexDir: resolve(runDir, "codex"),
    judgeDir: resolve(runDir, "judge"),
  };
}

export function isReviewScopedRunDir(paths: ReviewPaths): boolean {
  const relativePath = relative(paths.runsDir, paths.runDir);
  return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.includes(`${sep}..${sep}`);
}
