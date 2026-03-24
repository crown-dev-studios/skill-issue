import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateStageArtifacts,
  parseCliOptions,
  type StageAttemptResult,
  type StageDefinition,
} from "../src/orchestrate-review-council.js";
import { reviewDoneSchema, reviewFindingsSchema } from "../src/schemas.js";
import {
  createRunId,
  deriveReviewId,
  normalizeReviewTarget,
} from "../src/review-session.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeTempStageDir(): { root: string; stageDir: string } {
  const root = mkdtempSync(join(tmpdir(), "rc-test-"));
  const stageDir = resolve(root, "stage");
  mkdirSync(stageDir, { recursive: true });
  return { root, stageDir };
}

function makeStageDefinition(stageDir: string): StageDefinition {
  return {
    name: "claude",
    displayName: "Claude",
    command: "echo test",
    stageDir,
    promptOutputName: "claude-review-export.md",
    promptTemplatePath: "/unused",
    promptTemplateSource: "test",
    requiredArtifacts: ["report.md", "findings.json"],
    jsonArtifactName: "findings.json",
    artifactSchema: reviewFindingsSchema,
    doneSchema: reviewDoneSchema,
    stageVars: {},
  };
}

function makeAttempt(overrides: Partial<StageAttemptResult> = {}): StageAttemptResult {
  return {
    exitCode: 0,
    timedOut: false,
    startedAt: "2026-03-18T00:00:00.000Z",
    finishedAt: "2026-03-18T00:00:01.000Z",
    stdoutPath: "/dev/null",
    stderrPath: "/dev/null",
    ...overrides,
  };
}

function writeValidArtifacts(stageDir: string, reviewId: string, runId: string): void {
  writeFileSync(resolve(stageDir, "report.md"), "# Report\n");
  writeJson(resolve(stageDir, "findings.json"), {
    review_id: reviewId,
    run_id: runId,
    reviewer: "claude",
    target: "staged changes",
    generated_at: "2026-03-18T00:00:00.000Z",
    summary: "One issue found.",
    findings: [{
      id: "F001", title: "Test", severity: "p1", confidence: "high",
      category: "security", description: "d", evidence: "e",
      recommended_fix: "f", files: [{ path: "src/a.ts", line: 1 }],
    }],
  });
  writeJson(resolve(stageDir, "done.json"), {
    review_id: reviewId,
    run_id: runId,
    reviewer: "claude",
    status: "complete",
    completed_at: "2026-03-18T00:00:01.000Z",
    finding_count: 1,
  });
}

// -- parseCliOptions --

describe("parseCliOptions", () => {
  test("returns null and sets exitCode when --target is missing", () => {
    const prev = process.exitCode;
    const result = parseCliOptions(["--claude-command", "echo"]);
    assert.equal(result, null);
    assert.equal(process.exitCode, 1);
    process.exitCode = prev;
  });

  test("returns null when --help is passed", () => {
    const prev = process.exitCode;
    process.exitCode = undefined;
    const result = parseCliOptions(["--help"]);
    assert.equal(result, null);
    assert.notEqual(process.exitCode, 1);
    process.exitCode = prev;
  });

  test("requires at least one reviewer command", () => {
    const prev = process.exitCode;
    const result = parseCliOptions(["--target", "test"]);
    assert.equal(result, null);
    assert.equal(process.exitCode, 1);
    process.exitCode = prev;
  });

  test("returns parsed options for valid args", () => {
    const result = parseCliOptions([
      "--target", "staged changes",
      "--claude-command", "claude --print",
      "--timeout", "60000",
      "--retries", "1",
      "--skip-judge",
    ]);
    assert.ok(result);
    assert.equal(result.target, "staged changes");
    assert.equal(result.claudeCommand, "claude --print");
    assert.equal(result.timeoutMs, 60000);
    assert.equal(result.maxRetries, 1);
    assert.equal(result.skipJudge, true);
  });
});

// -- evaluateStageArtifacts --

describe("evaluateStageArtifacts", () => {
  const reviewId = "test-review";
  const runId = "20260318-00000000-abcd1234";

  test("succeeds when all artifacts are valid", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      writeValidArtifacts(stageDir, reviewId, runId);

      const result = evaluateStageArtifacts(stage, makeAttempt(), true, reviewId, runId);
      assert.equal(result.success, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns timeout when process timed out", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      const result = evaluateStageArtifacts(stage, makeAttempt({ timedOut: true }), false, reviewId, runId);
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "timeout");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns process_failed on non-zero exit", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      const result = evaluateStageArtifacts(stage, makeAttempt({ exitCode: 1 }), false, reviewId, runId);
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "process_failed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns missing_artifacts when report.md is absent", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      // Write findings.json but not report.md
      writeJson(resolve(stageDir, "findings.json"), { review_id: reviewId, run_id: runId });
      const result = evaluateStageArtifacts(stage, makeAttempt(), false, reviewId, runId);
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "missing_artifacts");
      assert.ok(result.missingArtifacts.includes("report.md"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects artifacts with wrong review_id", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      writeValidArtifacts(stageDir, "wrong-id", "wrong-run");
      const result = evaluateStageArtifacts(stage, makeAttempt(), false, reviewId, runId);
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "schema_validation_failed");
      assert.ok(result.validationErrors?.some((e) => e.path === "review_id"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// -- review session helpers --

describe("review session", () => {
  test("normalizeReviewTarget collapses whitespace", () => {
    assert.equal(normalizeReviewTarget("  staged   changes "), "staged changes");
  });

  test("deriveReviewId is stable for the same inputs", () => {
    assert.equal(
      deriveReviewId("/tmp/repo", "staged changes"),
      deriveReviewId("/tmp/repo", " staged   changes "),
    );
  });

  test("deriveReviewId differs for different targets", () => {
    assert.notEqual(
      deriveReviewId("/tmp/repo", "staged changes"),
      deriveReviewId("/tmp/repo", "branch main..HEAD"),
    );
  });

  test("createRunId produces unique values", () => {
    const a = createRunId(new Date("2026-03-18T00:00:00.000Z"), "11111111-1111-1111-1111-111111111111");
    const b = createRunId(new Date("2026-03-18T00:00:00.000Z"), "22222222-2222-2222-2222-222222222222");
    assert.notEqual(a, b);
  });
});
