import { strict as assert } from "node:assert";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import {
  evaluateStageArtifacts,
  main,
  parseCliOptions,
  printHelp,
  type StageAttemptResult,
  type StageDefinition,
} from "../src/orchestrate-review-council.js";
import { createStageExecution } from "../src/stage-runtime.js";
import {
  createRunId,
  normalizeReviewTarget,
} from "../src/review-session.js";

const FAKE_CLAUDE_SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const stageDir = process.env.CLAUDE_DIR;
const scenario = process.env.RC_FAKE_CLAUDE_SCENARIO ?? "success";

function writeArtifacts() {
  fs.writeFileSync(path.join(stageDir, "report.md"), "# Claude Report\\n");
  fs.writeFileSync(path.join(stageDir, "findings.json"), JSON.stringify({
    reviewer: "claude",
    target: "staged changes",
    generated_at: "2026-03-30T00:00:00.000Z",
    summary: "One issue found.",
    findings: [
      {
        id: "F001",
        title: "Example finding",
        severity: "p2",
        confidence: "high",
        category: "testing",
        description: "Example description",
        evidence: "Example evidence",
        recommended_fix: "Example fix",
        files: [{ path: "src/example.ts", line: 1 }],
      },
    ],
  }, null, 2) + "\\n");
  fs.writeFileSync(path.join(stageDir, "done.json"), JSON.stringify({
    reviewer: "claude",
    status: "complete",
    completed_at: "2026-03-30T00:00:01.000Z",
    finding_count: 1,
  }, null, 2) + "\\n");
}

(async () => {
  if (scenario === "timeout") {
    setInterval(() => {}, 1000);
    return;
  }

  if (scenario === "malformed") {
    process.stdout.write("not-json\\n");
  }

  process.stdout.write(JSON.stringify({ type: "message_start" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "message_delta", delta: "reviewing" }) + "\\n");
  process.stdout.write(JSON.stringify({
    type: "assistant",
    message: {
      content: [{ type: "text", text: "looking at the diff" }],
    },
  }) + "\\n");
  process.stdout.write(JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        id: "toolu_test",
        name: "Read",
      },
    },
  }) + "\\n");

  writeArtifacts();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
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
    execution: {
      commandId: "codex-review",
      command: "echo test",
      artifacts: {
        streamLog: resolve(stageDir, "stream.jsonl"),
        stderrLog: resolve(stageDir, "stderr.log"),
        eventsLog: resolve(stageDir, "events.jsonl"),
        runtimeLog: resolve(stageDir, "runtime.json"),
      },
    },
    stageDir,
    promptOutputName: "claude-review-export.md",
    promptTemplatePath: "/unused",
    promptTemplateSource: "test",
    requiredArtifacts: ["report.md", "findings.json"],
    jsonArtifactName: "findings.json",
    stageVars: {},
  };
}

function makeAttempt(overrides: Partial<StageAttemptResult> = {}): StageAttemptResult {
  return {
    exitCode: 0,
    timedOut: false,
    startedAt: "2026-03-18T00:00:00.000Z",
    finishedAt: "2026-03-18T00:00:01.000Z",
    streamPath: "/dev/null",
    stderrPath: "/dev/null",
    eventsPath: "/dev/null",
    runtimePath: "/dev/null",
    streamEventCount: 0,
    streamParseErrors: 0,
    warnings: [],
    ...overrides,
  };
}

function writeValidArtifacts(stageDir: string): void {
  writeFileSync(resolve(stageDir, "report.md"), "# Report\n");
  writeJson(resolve(stageDir, "findings.json"), {
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
    reviewer: "claude",
    status: "complete",
    completed_at: "2026-03-18T00:00:01.000Z",
    finding_count: 1,
  });
}

function captureHelpOutput(): string {
  const originalLog = console.log;
  const messages: string[] = [];
  console.log = (...items: unknown[]) => {
    messages.push(items.join(" "));
  };

  try {
    printHelp();
  } finally {
    console.log = originalLog;
  }

  return messages.join("\n");
}

async function runFakeClaudeScenario(
  scenario: "success" | "malformed" | "timeout",
  extraArgs: string[] = [],
): Promise<{ root: string; runDir: string; exitCode: number | undefined }> {
  const root = mkdtempSync(join(tmpdir(), "rc-main-"));
  const projectDir = resolve(root, "project");
  const binDir = resolve(root, "bin");
  const runDir = resolve(root, "run");

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeExecutable(resolve(binDir, "claude"), FAKE_CLAUDE_SCRIPT);

  const previousCwd = process.cwd();
  const previousPath = process.env.PATH;
  const previousScenario = process.env.RC_FAKE_CLAUDE_SCENARIO;
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;

  process.chdir(projectDir);
  process.env.PATH = `${binDir}:${previousPath ?? ""}`;
  process.env.RC_FAKE_CLAUDE_SCENARIO = scenario;
  process.exitCode = undefined;
  console.log = (..._items: unknown[]) => {};
  console.error = (..._items: unknown[]) => {};

  try {
    await main([
      "--target", "staged changes",
      "--no-codex",
      "--skip-judge",
      "--skip-html",
      "--run-dir", runDir,
      ...extraArgs,
    ]);
    return {
      root,
      runDir,
      exitCode: process.exitCode,
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.chdir(previousCwd);
    process.env.PATH = previousPath;
    if (previousScenario === undefined) {
      delete process.env.RC_FAKE_CLAUDE_SCENARIO;
    } else {
      process.env.RC_FAKE_CLAUDE_SCENARIO = previousScenario;
    }
    process.exitCode = previousExitCode;
  }
}

// -- parseCliOptions --

describe("parseCliOptions", () => {
  test("returns null and sets exitCode when --target is missing", () => {
    const prev = process.exitCode;
    const result = parseCliOptions([]);
    assert.equal(result, null);
    assert.equal(process.exitCode, 1);
    process.exitCode = prev;
  });

  test("rejects removed command override flags", () => {
    const prev = process.exitCode;
    process.exitCode = undefined;
    const result = parseCliOptions(["--target", "test", "--claude-command", "echo"]);
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

  test("uses canonical defaults when none are provided", () => {
    const result = parseCliOptions(["--target", "test"]);
    assert.ok(result);
    assert.equal(result.enableClaude, true);
    assert.equal(result.enableCodex, true);
    assert.equal(result.skipJudge, false);
    assert.equal(result.timeoutMs, 900000);
    assert.equal(Object.hasOwn(result as unknown as Record<string, unknown>, "claudeCommand"), false);
    assert.equal(Object.hasOwn(result as unknown as Record<string, unknown>, "allowMissingSentinel"), false);
  });

  test("normalizes skill directory inputs and removes blank entries", () => {
    const result = parseCliOptions([
      "--target", "staged changes",
      "--skill-paths", " ./skills/architecture-review , , ./skills/testing-philosophy/ ",
    ]);
    assert.ok(result);
    assert.deepEqual(result.skillPaths, [
      resolve("skills/architecture-review"),
      resolve("skills/testing-philosophy"),
    ]);
  });

  test("rejects --no-claude and --no-codex together", () => {
    const prev = process.exitCode;
    const result = parseCliOptions(["--target", "test", "--no-claude", "--no-codex"]);
    assert.equal(result, null);
    assert.equal(process.exitCode, 1);
    process.exitCode = prev;
  });

  test("returns parsed options for valid args", () => {
    const result = parseCliOptions([
      "--target", "staged changes",
      "--timeout", "60000",
      "--skip-judge",
    ]);
    assert.ok(result);
    assert.equal(result.target, "staged changes");
    assert.equal(result.timeoutMs, 60000);
    assert.equal(result.skipJudge, true);
  });

  test("help output omits removed override and sentinel flags", () => {
    const help = captureHelpOutput();
    assert.doesNotMatch(help, /--claude-command/);
    assert.doesNotMatch(help, /--codex-command/);
    assert.doesNotMatch(help, /--judge-command/);
    assert.doesNotMatch(help, /--allow-missing-sentinel/);
  });
});

// -- evaluateStageArtifacts --

describe("evaluateStageArtifacts", () => {
  test("succeeds when all artifacts are valid", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      writeValidArtifacts(stageDir);

      const result = evaluateStageArtifacts(stage, makeAttempt());
      assert.equal(result.success, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns timeout when process timed out", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      const result = evaluateStageArtifacts(stage, makeAttempt({ timedOut: true }));
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
      const result = evaluateStageArtifacts(stage, makeAttempt({ exitCode: 1 }));
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
      writeJson(resolve(stageDir, "findings.json"), { reviewer: "claude" });
      const result = evaluateStageArtifacts(stage, makeAttempt());
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "missing_artifacts");
      assert.ok(result.missingArtifacts.includes("report.md"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns invalid_artifacts with validation errors for malformed structured output", () => {
    const { root, stageDir } = makeTempStageDir();
    try {
      const stage = makeStageDefinition(stageDir);
      writeFileSync(resolve(stageDir, "report.md"), "# Report\n");
      writeJson(resolve(stageDir, "findings.json"), { findings: "wrong" });
      writeJson(resolve(stageDir, "done.json"), { status: "complete" });

      const result = evaluateStageArtifacts(stage, makeAttempt());
      assert.equal(result.success, false);
      assert.equal(result.failureReason, "invalid_artifacts");
      assert.deepEqual(result.validationErrors, [
        { path: "findings", message: "Expected findings to be an array." },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// -- integrated Claude runtime --

describe("main Claude runtime", () => {
  test("uses JSONL streaming for Claude, Codex, and judge commands", () => {
    const executionRoot = resolve("/tmp", "review-council-stage-exec");
    const claudeExecution = createStageExecution("claude", resolve(executionRoot, "claude"), "claude-review-export.md");
    const codexExecution = createStageExecution("codex", resolve(executionRoot, "codex"), "codex-review-export.md");
    const judgeExecution = createStageExecution("judge", resolve(executionRoot, "judge"), "judge.md");

    assert.equal(claudeExecution.commandId, "claude-review");
    assert.match(claudeExecution.command, /--model 'claude-opus-4-6'/);
    assert.match(claudeExecution.command, /--effort 'max'/);
    assert.match(claudeExecution.command, /--output-format stream-json/);
    assert.doesNotMatch(claudeExecution.command, /--debug\b/);
    assert.match(codexExecution.command, /'codex' 'exec' '--json' '--dangerously-bypass-approvals-and-sandbox' '--model' 'gpt-5\.4'/);
    assert.match(codexExecution.command, /'model_reasoning_effort=\"xhigh\"'/);
    assert.match(judgeExecution.command, /'codex' 'exec' '--json' '--dangerously-bypass-approvals-and-sandbox' '--model' 'gpt-5\.4'/);
    assert.match(judgeExecution.command, /'model_reasoning_effort=\"xhigh\"'/);
    assert.doesNotMatch(codexExecution.command, /notify=/);
    assert.doesNotMatch(judgeExecution.command, /notify=/);
    assert.match(claudeExecution.artifacts.streamLog, /stream\.jsonl$/);
    assert.match(codexExecution.artifacts.streamLog, /stream\.jsonl$/);
    assert.match(judgeExecution.artifacts.streamLog, /stream\.jsonl$/);
  });

  test("writes canonical Claude execution metadata and stream observability artifacts", async () => {
    const context = await runFakeClaudeScenario("success");
    try {
      const run = readJson(resolve(context.runDir, "run.json"));
      const status = readJson(resolve(context.runDir, "claude", "status.json"));

      const stageExecutions = run.stage_executions as Record<string, Record<string, unknown> | null>;
      assert.equal(context.exitCode, 0);
      assert.equal(Object.hasOwn(run, "command_templates"), false);
      assert.ok(stageExecutions.claude);
      assert.equal(stageExecutions.claude?.command_id, "claude-review");
      assert.equal(stageExecutions.codex, null);
      assert.equal(stageExecutions.judge, null);

      const claudeArtifacts = stageExecutions.claude?.artifacts as Record<string, string | undefined>;
      assert.ok(claudeArtifacts.stream_log);
      assert.ok(claudeArtifacts.events_log);
      assert.ok(claudeArtifacts.runtime_log);

      assert.equal(status.success, true);
      assert.equal(status.command_id, "claude-review");
      assert.equal(status.stream_event_count, 4);
      assert.equal(status.stream_parse_errors, 0);
      assert.equal(typeof status.last_activity_at, "string");
      assert.equal(typeof status.last_event_type, "string");
      assert.equal(Array.isArray(status.warnings), false);

      assert.equal(typeof status.stream_log, "string");
      assert.equal(typeof status.stderr_log, "string");
      assert.equal(typeof status.events_log, "string");
      assert.equal(typeof status.runtime_log, "string");
      assert.equal(readFileSync(status.stream_log as string, "utf8").length > 0, true);
      assert.equal(readFileSync(status.stderr_log as string, "utf8"), "");
      const events = readFileSync(status.events_log as string, "utf8");
      assert.match(events, /stage_started/);
      assert.match(events, /"type":"stream_progress"/);
      assert.match(events, /"progress_kind":"assistant_delta"/);
      assert.match(events, /"progress_kind":"assistant"/);
      assert.match(events, /"progress_kind":"tool_use"/);
      assert.match(readFileSync(status.runtime_log as string, "utf8"), /"runtime_state": "complete"/);
      assert.equal(existsSync(resolve(context.root, "project", ".claude", "settings.json")), false);
    } finally {
      rmSync(context.root, { recursive: true, force: true });
    }
  });

  test("records normalized stream progress events from Claude stdout", async () => {
    const context = await runFakeClaudeScenario("success");
    try {
      const events = readFileSync(resolve(context.runDir, "claude", "events.jsonl"), "utf8");

      assert.equal(context.exitCode, 0);
      assert.match(events, /"type":"stream_progress"/);
      assert.match(events, /"preview":"reviewing"/);
      assert.match(events, /"tool_name":"Read"/);
    } finally {
      rmSync(context.root, { recursive: true, force: true });
    }
  });

  test("records stream parse warnings without failing the stage", async () => {
    const context = await runFakeClaudeScenario("malformed");
    try {
      const status = readJson(resolve(context.runDir, "claude", "status.json"));
      assert.equal(context.exitCode, 0);
      assert.equal(status.success, true);
      assert.equal(status.stream_event_count, 4);
      assert.equal(status.stream_parse_errors, 1);
      assert.deepEqual(status.warnings, [
        "Failed to parse claude stream output line 1.",
      ]);
    } finally {
      rmSync(context.root, { recursive: true, force: true });
    }
  });

  test("marks timed out Claude runs as failed while preserving diagnostics metadata", async () => {
    const context = await runFakeClaudeScenario("timeout", ["--timeout", "50"]);
    try {
      const status = readJson(resolve(context.runDir, "claude", "status.json"));
      assert.equal(context.exitCode, 1);
      assert.equal(status.success, false);
      assert.equal(status.timed_out, true);
      assert.equal(status.exit_code, 124);
      assert.deepEqual(status.missing_artifacts, ["report.md", "findings.json", "done.json"]);
      assert.equal(Array.isArray(status.warnings), false);
    } finally {
      rmSync(context.root, { recursive: true, force: true });
    }
  });
});

// -- review session helpers --

describe("review session", () => {
  test("normalizeReviewTarget collapses whitespace", () => {
    assert.equal(normalizeReviewTarget("  staged   changes "), "staged changes");
  });

  test("createRunId produces unique values", () => {
    const a = createRunId(new Date("2026-03-18T00:00:00.000Z"), "11111111-1111-1111-1111-111111111111");
    const b = createRunId(new Date("2026-03-18T00:00:00.000Z"), "22222222-2222-2222-2222-222222222222");
    assert.notEqual(a, b);
  });
});
