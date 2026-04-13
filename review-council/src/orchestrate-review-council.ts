import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  appendRuntimeEvent,
  writeRuntimeSnapshot,
  type RuntimeSnapshotState,
} from "./stage-artifacts.js";
import {
  buildReviewPaths,
  createRunId,
  normalizeReviewTarget,
} from "./review-session.js";
import { renderRunDir, writeFollowUpsMarkdown } from "./render-review-html.js";
import { createStageExecution, type StageExecution, type StageName } from "./stage-runtime.js";
import { extractObservedEventType, extractStreamProgressEvent } from "./stream-progress.js";

interface PromptSelection {
  templatePath: string;
  source: string;
}

export interface StageDefinition {
  name: StageName;
  execution: StageExecution;
  stageDir: string;
  promptOutputName: string;
  promptTemplatePath: string;
  promptTemplateSource: string;
  requiredArtifacts: string[];
  jsonArtifactName: "findings.json" | "verdict.json";
  stageVars: Record<string, string>;
}

export interface StageAttemptResult {
  exitCode: number;
  timedOut: boolean;
  startedAt: string;
  finishedAt: string;
  streamPath: string;
  stderrPath: string;
  eventsPath: string;
  runtimePath: string;
  lastActivityAt?: string;
  lastEventType?: string;
  heartbeatAt?: string;
  lastStdoutAt?: string;
  lastStderrAt?: string;
  streamEventCount: number;
  streamParseErrors: number;
  warnings: string[];
}

interface ValidationError {
  path: string;
  message: string;
}

interface StageEvaluation {
  success: boolean;
  failureReason?: "process_failed" | "timeout" | "missing_artifacts" | "invalid_artifacts";
  artifactPresence: Record<string, boolean>;
  missingArtifacts: string[];
  validationErrors: ValidationError[];
}

export interface StageResult {
  name: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  failure_reason?: StageEvaluation["failureReason"];
  missing_artifacts?: string[];
  artifact_presence?: Record<string, boolean>;
  validation_errors?: ValidationError[];
}

interface CliOptions {
  target: string;
  runDir?: string;
  enableClaude: boolean;
  enableCodex: boolean;
  claudePromptTemplate?: string;
  codexPromptTemplate?: string;
  judgePromptTemplate?: string;
  skipJudge: boolean;
  skipHtml: boolean;
  openHtml: boolean;
  skillPaths?: string[];
  timeoutMs: number;
}

interface PromptSelections {
  claude: PromptSelection;
  codex: PromptSelection;
  judge: PromptSelection | null;
}

interface PreparedRun {
  options: CliOptions;
  cwd: string;
  packageDir: string;
  reviewTarget: string;
  runId: string;
  judgeEnabled: boolean;
  paths: ReturnType<typeof buildReviewPaths>;
  promptSelections: PromptSelections;
  commandEnv: Record<string, string>;
  stageDefinitions: StageDefinition[];
}

interface ReviewerExecution {
  reviewerResults: StageResult[];
  successfulReviewerResults: StageResult[];
  reviewersOk: boolean;
  reviewersPartial: boolean;
}

const DEFAULT_TIMEOUT_MS = 900000;
const HEARTBEAT_INTERVAL_MS = 15000;
const REVIEW_TEMPLATE_FILE = "reviewer-export.md";
const JUDGE_TEMPLATE_FILE = "judge.md";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSkillPaths(rawSkillPaths: string): string[] | undefined {
  const skillPaths = Array.from(
    new Set(
      rawSkillPaths
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => resolve(item)),
    ),
  );
  return skillPaths.length > 0 ? skillPaths : undefined;
}

export function buildSkillReferencesSection(skillPaths: string[]): string {
  if (skillPaths.length === 0) {
    return `## Selected Review Skills

No additional review skills were selected for this review.`;
  }

  const lines: string[] = [];
  for (const skillPath of skillPaths) {
    const normalizedPath = skillPath.replace(/[\\/]+$/, "");
    const skillName = basename(normalizedPath) || normalizedPath;
    lines.push(`- \`${skillName}\` at \`${normalizedPath}\``);
  }

  return `## Selected Review Skills

For this review, use these skills. The paths are provided so you can discover them when needed. If a finding is primarily driven by one selected skill, use that skill name as the \`category\` value in \`findings.json\`.

${lines.join("\n")}`;
}

function assertBinaryOnPath(binary: string): void {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
  } catch {
    throw new Error(`Required binary not found on PATH: ${binary}`);
  }
}


function renderTemplate(
  templatePath: string,
  variables: Record<string, string>,
  outputPath: string,
): string {
  const content = readFileSync(templatePath, "utf8");
  const rendered = content.replaceAll(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? `{{${key}}}`;
  });
  writeFileSync(outputPath, rendered);
  return outputPath;
}

function resolvePromptSelection(
  packageDir: string,
  kind: "review" | "judge",
  overridePath?: string,
): PromptSelection {
  if (overridePath) {
    const templatePath = resolve(overridePath);
    if (!existsSync(templatePath)) {
      throw new Error(`Prompt template override not found: ${templatePath}`);
    }
    return {
      templatePath,
      source: `override:${templatePath}`,
    };
  }

  const templateName = kind === "review" ? REVIEW_TEMPLATE_FILE : JUDGE_TEMPLATE_FILE;
  const templatePath = resolve(packageDir, "templates", templateName);
  if (!existsSync(templatePath)) {
    throw new Error(`Prompt template not found for ${kind}: ${templatePath}`);
  }

  return {
    templatePath,
    source: `${kind}-default`,
  };
}

function cleanupStageFiles(stage: StageDefinition): void {
  const { artifacts } = stage.execution;
  const paths = [
    artifacts.streamLog,
    artifacts.stderrLog,
    artifacts.eventsLog,
    artifacts.runtimeLog,
    resolve(stage.stageDir, "status.json"),
    resolve(stage.stageDir, "done.json"),
    ...stage.requiredArtifacts.map((name) => resolve(stage.stageDir, name)),
  ];

  for (const path of paths) {
    rmSync(path, { force: true });
  }
}


async function runStageOnce(
  stage: StageDefinition,
  workdir: string,
  timeoutMs: number,
  commandEnv: Record<string, string>,
): Promise<StageAttemptResult> {
  const { execution } = stage;
  const { streamLog: streamPath, stderrLog: stderrPath, eventsLog: eventsPath, runtimeLog: runtimePath } = execution.artifacts;
  const startedAt = nowIso();

  const streamFile = createWriteStream(streamPath);
  const stderrFile = createWriteStream(stderrPath);
  streamFile.on("error", () => {});
  stderrFile.on("error", () => {});

  const child = spawn("/bin/sh", ["-c", execution.command], {
    cwd: workdir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...commandEnv },
  });

  child.stdin.end();
  child.stdout.on("error", () => {});
  child.stderr.on("error", () => {});

  const warnings: string[] = [];
  let lastActivityAt: string | undefined;
  let lastEventType: string | undefined;
  let streamBuffer = "";
  let streamEventCount = 0;
  let streamParseErrors = 0;

  const runtimeSnapshot: RuntimeSnapshotState = {
    stage: stage.name,
    runtime_state: "starting",
    pid: child.pid ?? undefined,
    started_at: startedAt,
    heartbeat_at: undefined,
    last_stdout_at: undefined,
    last_stderr_at: undefined,
  };

  const flushRuntimeSnapshot = (): void => {
    writeRuntimeSnapshot(runtimePath, runtimeSnapshot, warnings);
  };

  appendRuntimeEvent(eventsPath, {
    ts: startedAt,
    type: "stage_started",
    stage: stage.name,
    pid: child.pid ?? null,
  }, warnings);
  runtimeSnapshot.runtime_state = "running";
  flushRuntimeSnapshot();

  const recordActivity = (eventType?: string): void => {
    lastActivityAt = nowIso();
    if (eventType) {
      lastEventType = eventType;
    }
  };

  const processStructuredLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      streamEventCount += 1;
      const observedEventType = extractObservedEventType(parsed) ?? "stream-event";
      recordActivity(observedEventType);
      const progressEvent = extractStreamProgressEvent(stage.name, parsed);
      if (progressEvent) {
        appendRuntimeEvent(eventsPath, {
          ts: nowIso(),
          ...progressEvent,
        }, warnings);
      }
    } catch {
      streamParseErrors += 1;
      recordActivity("stream-parse-error");
      warnings.push(`Failed to parse ${stage.name} stream output line ${streamParseErrors}.`);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    streamFile.write(chunk);
    runtimeSnapshot.last_stdout_at = nowIso();

    const text = chunk.toString();
    streamBuffer += text;
    while (true) {
      const newlineIndex = streamBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = streamBuffer.slice(0, newlineIndex);
      streamBuffer = streamBuffer.slice(newlineIndex + 1);
      processStructuredLine(line);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrFile.write(chunk);
    runtimeSnapshot.last_stderr_at = nowIso();
  });

  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = null;
    }
  };

  heartbeatTimer = setInterval(() => {
    runtimeSnapshot.heartbeat_at = nowIso();
    appendRuntimeEvent(eventsPath, {
      ts: runtimeSnapshot.heartbeat_at,
      type: "heartbeat",
      stage: stage.name,
      pid: child.pid ?? null,
    }, warnings);
    flushRuntimeSnapshot();
  }, HEARTBEAT_INTERVAL_MS);

  timeoutTimer = setTimeout(() => {
    timedOut = true;
    appendRuntimeEvent(eventsPath, {
      ts: nowIso(),
      type: "timeout_sent",
      stage: stage.name,
      signal: "SIGTERM",
    }, warnings);
    child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      try {
        appendRuntimeEvent(eventsPath, {
          ts: nowIso(),
          type: "kill_sent",
          stage: stage.name,
          signal: "SIGKILL",
        }, warnings);
        child.kill("SIGKILL");
      } catch {
        // Process already exited.
      }
    }, 5000);
  }, timeoutMs);

  const exitCode = await new Promise<number>((resolveExit) => {
    let settled = false;
    const settle = (code: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      resolveExit(code);
    };
    child.once("error", () => settle(1));
    child.once("close", (code) => settle(timedOut ? 124 : (code ?? 1)));
  });

  if (streamBuffer.trim().length > 0) {
    processStructuredLine(streamBuffer);
  }

  runtimeSnapshot.runtime_state = timedOut ? "timed_out" : "exited";
  appendRuntimeEvent(eventsPath, {
    ts: nowIso(),
    type: "process_exited",
    stage: stage.name,
    exit_code: exitCode,
    timed_out: timedOut,
  }, warnings);
  flushRuntimeSnapshot();

  streamFile.end();
  stderrFile.end();

  await Promise.all([
    finished(streamFile),
    finished(stderrFile),
  ]);

  return {
    exitCode,
    timedOut,
    startedAt,
    finishedAt: nowIso(),
    streamPath,
    stderrPath,
    eventsPath,
    runtimePath,
    lastActivityAt,
    lastEventType,
    heartbeatAt: runtimeSnapshot.heartbeat_at,
    lastStdoutAt: runtimeSnapshot.last_stdout_at,
    lastStderrAt: runtimeSnapshot.last_stderr_at,
    streamEventCount,
    streamParseErrors,
    warnings,
  };
}

export function evaluateStageArtifacts(
  stage: StageDefinition,
  attempt: StageAttemptResult,
): StageEvaluation {
  const artifactPresence: Record<string, boolean> = {};
  const requiredArtifacts = [...stage.requiredArtifacts, "done.json"];

  for (const artifactName of requiredArtifacts) {
    artifactPresence[artifactName] = existsSync(resolve(stage.stageDir, artifactName));
  }

  const missingArtifacts = requiredArtifacts.filter((artifactName) => !artifactPresence[artifactName]);

  if (attempt.timedOut) {
    return {
      success: false,
      failureReason: "timeout",
      artifactPresence,
      missingArtifacts,
      validationErrors: [],
    };
  }

  if (attempt.exitCode !== 0) {
    return {
      success: false,
      failureReason: "process_failed",
      artifactPresence,
      missingArtifacts,
      validationErrors: [],
    };
  }

  if (missingArtifacts.length > 0) {
    return {
      success: false,
      failureReason: "missing_artifacts",
      artifactPresence,
      missingArtifacts,
      validationErrors: [],
    };
  }

  const validationErrors = validateJsonArtifact(
    resolve(stage.stageDir, stage.jsonArtifactName),
    stage.jsonArtifactName,
  );
  if (validationErrors.length > 0) {
    return {
      success: false,
      failureReason: "invalid_artifacts",
      artifactPresence,
      missingArtifacts,
      validationErrors,
    };
  }

  return {
    success: true,
    artifactPresence,
    missingArtifacts,
    validationErrors: [],
  };
}

function validateJsonArtifact(
  artifactPath: string,
  artifactName: StageDefinition["jsonArtifactName"],
): ValidationError[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf8")) as unknown;
  } catch {
    return [{ path: "$", message: "File is not valid JSON." }];
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [{ path: "$", message: "Expected a JSON object." }];
  }

  if (artifactName === "findings.json") {
    return Array.isArray((parsed as { findings?: unknown }).findings)
      ? []
      : [{ path: "findings", message: "Expected findings to be an array." }];
  }

  const verdict = parsed as {
    overall_verdict?: unknown;
    confirmed_findings?: unknown;
    contested_findings?: unknown;
    rejected_findings?: unknown;
  };
  const errors: ValidationError[] = [];

  if (typeof verdict.overall_verdict !== "string") {
    errors.push({ path: "overall_verdict", message: "Expected overall_verdict to be a string." });
  }
  if (!Array.isArray(verdict.confirmed_findings)) {
    errors.push({ path: "confirmed_findings", message: "Expected confirmed_findings to be an array." });
  }
  if (!Array.isArray(verdict.contested_findings)) {
    errors.push({ path: "contested_findings", message: "Expected contested_findings to be an array." });
  }
  if (!Array.isArray(verdict.rejected_findings)) {
    errors.push({ path: "rejected_findings", message: "Expected rejected_findings to be an array." });
  }

  return errors;
}

function writeStageStatus(
  statusPath: string,
  stage: StageDefinition,
  attempt: StageAttemptResult,
  evaluation: StageEvaluation,
): void {
  writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        stage: stage.name,
        command_id: stage.execution.commandId,
        command: stage.execution.command,
        started_at: attempt.startedAt,
        finished_at: attempt.finishedAt,
        exit_code: attempt.exitCode,
        success: evaluation.success,
        timed_out: attempt.timedOut,
        stream_log: attempt.streamPath,
        stderr_log: attempt.stderrPath,
        events_log: attempt.eventsPath,
        runtime_log: attempt.runtimePath,
        last_activity_at: attempt.lastActivityAt,
        last_event_type: attempt.lastEventType,
        heartbeat_at: attempt.heartbeatAt,
        last_stdout_at: attempt.lastStdoutAt,
        last_stderr_at: attempt.lastStderrAt,
        stream_event_count: attempt.streamEventCount,
        stream_parse_errors: attempt.streamParseErrors,
        artifact_presence: evaluation.artifactPresence,
        missing_artifacts: evaluation.missingArtifacts,
        validation_errors: evaluation.validationErrors,
        ...(attempt.warnings.length > 0 ? { warnings: attempt.warnings } : {}),
      },
      null,
      2,
    )}\n`,
  );
}

async function runStage(
  stage: StageDefinition,
  workdir: string,
  timeoutMs: number,
  commandEnv: Record<string, string>,
): Promise<StageResult> {
  const statusPath = resolve(stage.stageDir, "status.json");

  cleanupStageFiles(stage);
  const attempt = await runStageOnce(stage, workdir, timeoutMs, commandEnv);

  appendRuntimeEvent(attempt.eventsPath, {
    ts: nowIso(),
    type: "validation_started",
    stage: stage.name,
  }, attempt.warnings);
  writeRuntimeSnapshot(attempt.runtimePath, {
    stage: stage.name,
    runtime_state: "validating",
    pid: undefined,
    started_at: attempt.startedAt,
    heartbeat_at: attempt.heartbeatAt,
    last_stdout_at: attempt.lastStdoutAt,
    last_stderr_at: attempt.lastStderrAt,
  }, attempt.warnings);

  const evaluation = evaluateStageArtifacts(stage, attempt);
  appendRuntimeEvent(attempt.eventsPath, {
    ts: nowIso(),
    type: "validation_completed",
    stage: stage.name,
    success: evaluation.success,
    failure_reason: evaluation.failureReason ?? null,
  }, attempt.warnings);
  writeRuntimeSnapshot(attempt.runtimePath, {
    stage: stage.name,
    runtime_state: evaluation.success ? "complete" : (attempt.timedOut ? "timed_out" : "failed"),
    pid: undefined,
    started_at: attempt.startedAt,
    heartbeat_at: attempt.heartbeatAt,
    last_stdout_at: attempt.lastStdoutAt,
    last_stderr_at: attempt.lastStderrAt,
  }, attempt.warnings);
  writeStageStatus(statusPath, stage, attempt, evaluation);

  return {
    name: stage.name,
    exit_code: attempt.exitCode,
    success: evaluation.success,
    timed_out: attempt.timedOut,
    failure_reason: evaluation.failureReason,
    missing_artifacts: evaluation.missingArtifacts,
    artifact_presence: evaluation.artifactPresence,
    validation_errors: evaluation.validationErrors,
  };
}

export function parseCliOptions(args: string[]): CliOptions | null {
  let values: ReturnType<typeof parseArgs>["values"];
  const getString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
  const getBoolean = (value: unknown): boolean => value === true;

  try {
    ({ values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        target: { type: "string" },
        "run-dir": { type: "string" },
        "claude-prompt-template": { type: "string" },
        "codex-prompt-template": { type: "string" },
        "judge-prompt-template": { type: "string" },
        "skill-paths": { type: "string" },
        "no-claude": { type: "boolean" },
        "no-codex": { type: "boolean" },
        "skip-judge": { type: "boolean" },
        "skip-html": { type: "boolean" },
        "open-html": { type: "boolean" },
        timeout: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }

  if (values.help) {
    printHelp();
    return null;
  }

  const target = getString(values.target);
  if (!target) {
    console.error("Error: --target is required.");
    console.error("Run `review-council --help` for usage.");
    process.exitCode = 1;
    return null;
  }

  const timeoutValue = getString(values.timeout);
  const timeoutMs = timeoutValue ? parseInt(timeoutValue, 10) : DEFAULT_TIMEOUT_MS;
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    console.error(`Invalid --timeout: "${timeoutValue}". Must be a positive integer (ms).`);
    process.exitCode = 1;
    return null;
  }

  const noClaude = getBoolean(values["no-claude"]);
  const noCodex = getBoolean(values["no-codex"]);

  if (noClaude && noCodex) {
    console.error("Cannot use both --no-claude and --no-codex. At least one model reviewer is required.");
    process.exitCode = 1;
    return null;
  }

  const skillPathsValue = getString(values["skill-paths"]);

  return {
    target,
    runDir: getString(values["run-dir"]),
    enableClaude: !noClaude,
    enableCodex: !noCodex,
    claudePromptTemplate: getString(values["claude-prompt-template"]),
    codexPromptTemplate: getString(values["codex-prompt-template"]),
    judgePromptTemplate: getString(values["judge-prompt-template"]),
    skipJudge: getBoolean(values["skip-judge"]),
    skipHtml: getBoolean(values["skip-html"]),
    openHtml: getBoolean(values["open-html"]),
    skillPaths: skillPathsValue ? normalizeSkillPaths(skillPathsValue) : undefined,
    timeoutMs,
  };
}

function resolvePromptSelections(
  packageDir: string,
  options: CliOptions,
  judgeEnabled: boolean,
): PromptSelections {
  return {
    claude: resolvePromptSelection(packageDir, "review", options.claudePromptTemplate),
    codex: resolvePromptSelection(packageDir, "review", options.codexPromptTemplate),
    judge: judgeEnabled
      ? resolvePromptSelection(packageDir, "judge", options.judgePromptTemplate)
      : null,
  };
}


function createStageDefinitions(
  paths: ReturnType<typeof buildReviewPaths>,
  promptSelections: PromptSelections,
  enabledStages: Record<StageName, boolean>,
  reviewTarget: string,
  reviewSchemaPath: string,
  judgeSchemaPath: string,
  skillReferences: string,
): StageDefinition[] {
  const reviewerStages: StageDefinition[] = [];

  if (enabledStages.claude) {
    reviewerStages.push({
      name: "claude",
      stageDir: paths.claudeDir,
      promptOutputName: "claude-review-export.md",
      execution: createStageExecution("claude", paths.claudeDir, "claude-review-export.md"),
      promptTemplatePath: promptSelections.claude.templatePath,
      promptTemplateSource: promptSelections.claude.source,
      requiredArtifacts: ["report.md", "findings.json"],
      jsonArtifactName: "findings.json",
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.claudeDir,
        SCHEMA_PATH: reviewSchemaPath,
        REVIEWER_NAME: "Claude",
        REVIEWER_NAME_LOWER: "claude",
        SKILL_REFERENCES: skillReferences,
      },
    });
  }

  if (enabledStages.codex) {
    reviewerStages.push({
      name: "codex",
      stageDir: paths.codexDir,
      promptOutputName: "codex-review-export.md",
      execution: createStageExecution("codex", paths.codexDir, "codex-review-export.md"),
      promptTemplatePath: promptSelections.codex.templatePath,
      promptTemplateSource: promptSelections.codex.source,
      requiredArtifacts: ["report.md", "findings.json"],
      jsonArtifactName: "findings.json",
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.codexDir,
        SCHEMA_PATH: reviewSchemaPath,
        REVIEWER_NAME: "Codex",
        REVIEWER_NAME_LOWER: "codex",
        SKILL_REFERENCES: skillReferences,
      },
    });
  }

  if (!enabledStages.judge || !promptSelections.judge) {
    return reviewerStages;
  }

  return [
    ...reviewerStages,
    {
      name: "judge",
      stageDir: paths.judgeDir,
      promptOutputName: "judge.md",
      execution: createStageExecution("judge", paths.judgeDir, "judge.md"),
      promptTemplatePath: promptSelections.judge.templatePath,
      promptTemplateSource: promptSelections.judge.source,
      requiredArtifacts: ["summary.md", "verdict.json"],
      jsonArtifactName: "verdict.json",
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.judgeDir,
        SCHEMA_PATH: judgeSchemaPath,
      },
    },
  ];
}

function serializeExecutionMetadata(stage: StageDefinition | undefined): Record<string, unknown> | null {
  if (!stage) {
    return null;
  }

  return {
    stage_dir: stage.stageDir,
    prompt_output_name: stage.promptOutputName,
    command_id: stage.execution.commandId,
    command: stage.execution.command,
    artifacts: {
      stream_log: stage.execution.artifacts.streamLog,
      stderr_log: stage.execution.artifacts.stderrLog,
      events_log: stage.execution.artifacts.eventsLog,
      runtime_log: stage.execution.artifacts.runtimeLog,
    },
  };
}

function writeRunMetadata(preparedRun: PreparedRun): void {
  const {
    options,
    cwd,
    packageDir,
    reviewTarget,
    runId,
    judgeEnabled,
    paths,
    promptSelections,
    stageDefinitions,
  } = preparedRun;

  const stageIndex = new Map(stageDefinitions.map((stage) => [stage.name, stage] as const));

  writeFileSync(
    resolve(paths.runDir, "run.json"),
    `${JSON.stringify(
      {
        run_id: runId,
        review_target: reviewTarget,
        created_at: nowIso(),
        cwd,
        skill_dir: packageDir,
        run_dir: paths.runDir,
        selected_skills: options.skillPaths ?? [],
        prompt_templates: {
          claude: {
            path: promptSelections.claude.templatePath,
            source: promptSelections.claude.source,
          },
          codex: {
            path: promptSelections.codex.templatePath,
            source: promptSelections.codex.source,
          },
          judge: {
            path: promptSelections.judge?.templatePath ?? null,
            source: promptSelections.judge?.source ?? null,
          },
        },
        judge_enabled: judgeEnabled,
        stage_executions: {
          claude: serializeExecutionMetadata(stageIndex.get("claude")),
          codex: serializeExecutionMetadata(stageIndex.get("codex")),
          judge: serializeExecutionMetadata(stageIndex.get("judge")),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function prepareRun(options: CliOptions): PreparedRun | null {
  const moduleDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const packageDir = resolve(moduleDir, "..");
  const cwd = process.cwd();
  const reviewTarget = normalizeReviewTarget(options.target);
  const runId = createRunId();
  const paths = buildReviewPaths(cwd, runId, options.runDir);
  const judgeEnabled = !options.skipJudge;

  let promptSelections: PromptSelections;
  try {
    promptSelections = resolvePromptSelections(packageDir, options, judgeEnabled);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }

  for (const dir of [paths.runDir, paths.claudeDir, paths.codexDir, paths.judgeDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const reviewSchemaPath = resolve(packageDir, "schemas", "review-findings.schema.json");
  const judgeSchemaPath = resolve(packageDir, "schemas", "judge-verdict.schema.json");
  const commandEnv: Record<string, string> = {
    CWD: cwd,
    SKILL_DIR: packageDir,
    RUN_ID: runId,
    RUN_DIR: paths.runDir,
    CLAUDE_DIR: paths.claudeDir,
    CODEX_DIR: paths.codexDir,
    JUDGE_DIR: paths.judgeDir,
    REVIEW_SCHEMA: reviewSchemaPath,
    JUDGE_SCHEMA: judgeSchemaPath,
  };

  const skillReferences = buildSkillReferencesSection(options.skillPaths ?? []);
  let stageDefinitions: StageDefinition[];

  try {
    stageDefinitions = createStageDefinitions(
      paths,
      promptSelections,
      {
        claude: options.enableClaude,
        codex: options.enableCodex,
        judge: judgeEnabled,
      },
      reviewTarget,
      reviewSchemaPath,
      judgeSchemaPath,
      skillReferences,
    );

    for (const stage of stageDefinitions) {
      renderTemplate(
        stage.promptTemplatePath,
        stage.stageVars,
        resolve(stage.stageDir, stage.promptOutputName),
      );
    }

    writeRunMetadata({
      options,
      cwd,
      packageDir,
      reviewTarget,
      runId,
      judgeEnabled,
      paths,
      promptSelections,
      commandEnv,
      stageDefinitions,
    });

    const enabledBinaries = new Set<string>();
    for (const stage of stageDefinitions) {
      enabledBinaries.add(stage.name === "claude" ? "claude" : "codex");
    }
    for (const binary of enabledBinaries) {
      assertBinaryOnPath(binary);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }

  return {
    options,
    cwd,
    packageDir,
    reviewTarget,
    runId,
    judgeEnabled,
    paths,
    promptSelections,
    commandEnv,
    stageDefinitions,
  };
}

async function runReviewerStages(preparedRun: PreparedRun): Promise<ReviewerExecution> {
  const reviewerStages = preparedRun.stageDefinitions.filter((s) => s.name !== "judge");

  const results = await Promise.all(
    reviewerStages.map((stage) =>
      runStage(
        stage,
        preparedRun.cwd,
        preparedRun.options.timeoutMs,
        preparedRun.commandEnv,
      ),
    ),
  );

  const reviewerResults = results;
  const successfulReviewerResults = reviewerResults.filter((result) => result.success);

  return {
    reviewerResults,
    successfulReviewerResults,
    reviewersOk: reviewerResults.length > 0 && successfulReviewerResults.length === reviewerResults.length,
    reviewersPartial: successfulReviewerResults.length > 0 && successfulReviewerResults.length < reviewerResults.length,
  };
}

async function runJudgeStage(
  preparedRun: PreparedRun,
  reviewerExecution: ReviewerExecution,
): Promise<StageResult | null> {
  if (!preparedRun.judgeEnabled) {
    return null;
  }

  if (reviewerExecution.reviewerResults.length === 0) {
    console.error("Judge stage requires at least one configured reviewer command.");
    process.exitCode = 1;
    return null;
  }

  if (reviewerExecution.successfulReviewerResults.length === 0) {
    return null;
  }

  const judgeStage = preparedRun.stageDefinitions.find((stage) => stage.name === "judge");
  if (!judgeStage) {
    return null;
  }

  return runStage(
    judgeStage,
    preparedRun.cwd,
    preparedRun.options.timeoutMs,
    preparedRun.commandEnv,
  );
}

function finalizeRun(
  preparedRun: PreparedRun,
  reviewerExecution: ReviewerExecution,
  judgeResult: StageResult | null,
): void {
  if (judgeResult?.success === true) {
    writeFollowUpsMarkdown(preparedRun.paths.runDir);
  }

  if (!preparedRun.options.skipHtml) {
    renderRunDir(preparedRun.paths.runDir);
  }

  if (preparedRun.options.openHtml && !preparedRun.options.skipHtml) {
    const htmlPath = resolve(preparedRun.paths.runDir, "index.html");
    if (existsSync(htmlPath)) {
      spawn("open", [htmlPath], { stdio: "ignore", detached: true }).unref();
    }
  }

  const runUsable = reviewerExecution.successfulReviewerResults.length > 0
    && (!preparedRun.judgeEnabled || judgeResult?.success === true);

  console.log(JSON.stringify({
    run_id: preparedRun.runId,
    run_dir: preparedRun.paths.runDir,
    reviewers_ok: reviewerExecution.reviewersOk,
    reviewers_partial: reviewerExecution.reviewersPartial,
    reviewers: reviewerExecution.reviewerResults.map((result) => ({
      name: result.name,
      success: result.success,
      timed_out: result.timed_out,
      exit_code: result.exit_code,
      failure_reason: result.failure_reason ?? null,
      missing_artifacts: result.missing_artifacts ?? [],
    })),
    judge_ran: judgeResult !== null,
    judge_ok: judgeResult?.success ?? false,
  }, null, 2));

  process.exitCode = runUsable ? 0 : 1;
}

export function printHelp(commandName: string = "review-council"): void {
  console.log(`${commandName} — Run model-parallel code review and synthesize findings

Usage: ${commandName} --target <target> [options]

Description:
  Runs Claude and Codex in parallel against the specified review target,
  then synthesizes their outputs through an LLM judge. Writes structured
  artifacts (findings.json, status.json, events.jsonl, runtime.json) per
  stage to docs/reviews/<run-id>/ and renders a static HTML report.

Required:
  --target <target>                Review target label (e.g. "staged changes")

Options:
  --run-dir <dir>                  Output directory for this run
  --no-claude                      Skip the Claude reviewer
  --no-codex                       Skip the Codex reviewer
  --skill-paths <paths>            Comma-separated paths to review skill directories
  --claude-prompt-template <path>  Override Claude reviewer prompt template
  --codex-prompt-template <path>   Override Codex reviewer prompt template
  --judge-prompt-template <path>   Override judge prompt template
  --skip-judge                     Skip the judge stage
  --skip-html                      Skip HTML rendering
  --open-html                      Open index.html after rendering (macOS)
  --timeout <ms>                   Stage timeout in ms (default: 900000)
  -h, --help                       Show this help

Examples:
  ${commandName} --target "staged changes" --open-html
  ${commandName} --target "branch main..feature" --no-codex
  ${commandName} --target "pr 123" --skill-paths /path/to/architecture-review`);
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseCliOptions(args);
  if (!options) {
    return;
  }

  const preparedRun = prepareRun(options);
  if (!preparedRun) {
    return;
  }

  const reviewerExecution = await runReviewerStages(preparedRun);
  const judgeResult = await runJudgeStage(preparedRun, reviewerExecution);
  finalizeRun(preparedRun, reviewerExecution, judgeResult);
}
