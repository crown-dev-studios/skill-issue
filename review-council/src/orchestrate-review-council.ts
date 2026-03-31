import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  buildReviewPaths,
  createRunId,
  normalizeReviewTarget,
} from "./review-session.js";
import { renderRunDir, writeFollowUpsMarkdown } from "./render-review-html.js";
import { createStageExecution, type StageExecution, type StageName } from "./stage-runtime.js";

interface PromptSelection {
  templatePath: string;
  source: string;
  profileId: string;
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
  lastActivityAt?: string;
  lastEventType?: string;
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
  attempts: number;
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
  reviewProfileId: string;
  judgeProfileId: string;
  claudePromptTemplate?: string;
  codexPromptTemplate?: string;
  judgePromptTemplate?: string;
  skipJudge: boolean;
  skipHtml: boolean;
  openHtml: boolean;
  skillPaths?: string[];
  timeoutMs: number;
  maxRetries: number;
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

const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_RETRIES = 2;
const REVIEW_PROFILE_TEMPLATES: Record<string, string> = {
  default: "reviewer-export.md",
};
const JUDGE_PROFILE_TEMPLATES: Record<string, string> = {
  default: "judge.md",
};

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

function extractBinaryForPreflight(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const tokens = trimmed.match(/(?:[^\s"'`]+|"[^"]*"|'[^']*')+/g) ?? [];
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) {
      continue;
    }

    if (/[|&;<>()`$]/.test(token)) {
      return null;
    }

    return token.replaceAll(/^['"]|['"]$/g, "") || null;
  }

  return null;
}

function assertBinaryExists(command: string, cwd: string): void {
  const binary = extractBinaryForPreflight(command);
  if (!binary) return;

  if (binary.includes("/")) {
    const resolvedBinary = resolve(cwd, binary);
    try {
      accessSync(resolvedBinary, constants.X_OK);
      return;
    } catch {
      throw new Error(`Required executable not found or not executable: ${binary}`);
    }
  }

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
  profileId: string,
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
      profileId,
    };
  }

  const templates = kind === "review" ? REVIEW_PROFILE_TEMPLATES : JUDGE_PROFILE_TEMPLATES;
  const templateName = templates[profileId];
  if (!templateName) {
    throw new Error(`Unknown ${kind} profile: ${profileId}`);
  }

  const templatePath = resolve(packageDir, "templates", templateName);
  if (!existsSync(templatePath)) {
    throw new Error(`Prompt template not found for ${kind} profile "${profileId}": ${templatePath}`);
  }

  return {
    templatePath,
    source: `${kind}-profile:${profileId}`,
    profileId,
  };
}

function cleanupStageFiles(stage: StageDefinition): void {
  const artifactPaths = new Set<string>([
    stage.execution.artifacts.streamLog,
    stage.execution.artifacts.stderrLog,
    resolve(stage.stageDir, "status.json"),
    resolve(stage.stageDir, "done.json"),
    ...stage.requiredArtifacts.map((artifactName) => resolve(stage.stageDir, artifactName)),
  ]);

  for (const artifactPath of artifactPaths) {
    rmSync(artifactPath, { force: true, recursive: false });
  }
}


function extractEventType(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const type = (value as Record<string, unknown>).type;
  return typeof type === "string" && type.length > 0 ? type : undefined;
}

async function runStageOnce(
  stage: StageDefinition,
  workdir: string,
  timeoutMs: number,
  commandEnv: Record<string, string>,
): Promise<StageAttemptResult> {
  const { execution } = stage;
  const streamPath = execution.artifacts.streamLog;
  const stderrPath = execution.artifacts.stderrLog;
  const startedAt = nowIso();

  const streamFile = createWriteStream(streamPath);
  const stderrFile = createWriteStream(stderrPath);

  const child = spawn("/bin/sh", ["-c", execution.command], {
    cwd: workdir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...commandEnv },
  });

  child.stdin.end();

  const warnings: string[] = [];
  let lastActivityAt: string | undefined;
  let lastEventType: string | undefined;
  let streamBuffer = "";
  let streamEventCount = 0;
  let streamParseErrors = 0;

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

    recordActivity(lastEventType);

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      streamEventCount += 1;
      lastEventType = extractEventType(parsed) ?? "stream-event";
    } catch {
      streamParseErrors += 1;
      lastEventType = "stream-parse-error";
      warnings.push(`Failed to parse ${stage.name} stream output line ${streamParseErrors}.`);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    streamFile.write(chunk);

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
  });

  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Process already exited.
      }
    }, 5000);
  }, timeoutMs);

  const exitCode = await new Promise<number>((resolveExit) => {
    child.once("error", () => resolveExit(1));
    child.once("close", (code) => resolveExit(timedOut ? 124 : (code ?? 1)));
  });

  clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);

  if (streamBuffer.trim().length > 0) {
    processStructuredLine(streamBuffer);
  }

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
    lastActivityAt,
    lastEventType,
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
  attempts: number,
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
        attempts,
        stream_log: attempt.streamPath,
        stderr_log: attempt.stderrPath,
        last_activity_at: attempt.lastActivityAt,
        last_event_type: attempt.lastEventType,
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
  maxRetries: number,
  commandEnv: Record<string, string>,
): Promise<StageResult> {
  const statusPath = resolve(stage.stageDir, "status.json");

  let attempts = 0;
  let lastAttempt: StageAttemptResult | null = null;
  let lastEvaluation: StageEvaluation | null = null;

  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex += 1) {
    if (attemptIndex > 0) {
      const delayMs = 2000 * Math.pow(2, attemptIndex - 1);
      process.stderr.write(`[${stage.name}] retry ${attemptIndex}/${maxRetries} in ${delayMs}ms\n`);
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }

    attempts = attemptIndex + 1;
    cleanupStageFiles(stage);
    lastAttempt = await runStageOnce(stage, workdir, timeoutMs, commandEnv);
    lastEvaluation = evaluateStageArtifacts(stage, lastAttempt);
    writeStageStatus(statusPath, stage, lastAttempt, lastEvaluation, attempts);

    if (lastEvaluation.success || lastAttempt.timedOut) {
      break;
    }
  }

  if (!lastAttempt || !lastEvaluation) {
    throw new Error(`Stage ${stage.name} never executed.`);
  }

  return {
    name: stage.name,
    exit_code: lastAttempt.exitCode,
    success: lastEvaluation.success,
    timed_out: lastAttempt.timedOut,
    attempts,
    failure_reason: lastEvaluation.failureReason,
    missing_artifacts: lastEvaluation.missingArtifacts,
    artifact_presence: lastEvaluation.artifactPresence,
    validation_errors: lastEvaluation.validationErrors,
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
        "review-profile": { type: "string" },
        "judge-profile": { type: "string" },
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
        retries: { type: "string" },
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
    printHelp();
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

  const retriesValue = getString(values.retries);
  const maxRetries = retriesValue ? parseInt(retriesValue, 10) : DEFAULT_MAX_RETRIES;
  if (Number.isNaN(maxRetries) || maxRetries < 0) {
    console.error(`Invalid --retries: "${retriesValue}". Must be a non-negative integer.`);
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
    reviewProfileId: getString(values["review-profile"]) ?? "default",
    judgeProfileId: getString(values["judge-profile"]) ?? "default",
    claudePromptTemplate: getString(values["claude-prompt-template"]),
    codexPromptTemplate: getString(values["codex-prompt-template"]),
    judgePromptTemplate: getString(values["judge-prompt-template"]),
    skipJudge: getBoolean(values["skip-judge"]),
    skipHtml: getBoolean(values["skip-html"]),
    openHtml: getBoolean(values["open-html"]),
    skillPaths: skillPathsValue ? normalizeSkillPaths(skillPathsValue) : undefined,
    timeoutMs,
    maxRetries,
  };
}

function resolvePromptSelections(
  packageDir: string,
  options: CliOptions,
  judgeEnabled: boolean,
): PromptSelections {
  return {
    claude: resolvePromptSelection(
      packageDir,
      "review",
      options.reviewProfileId,
      options.claudePromptTemplate,
    ),
    codex: resolvePromptSelection(
      packageDir,
      "review",
      options.reviewProfileId,
      options.codexPromptTemplate,
    ),
    judge: judgeEnabled
      ? resolvePromptSelection(
        packageDir,
        "judge",
        options.judgeProfileId,
        options.judgePromptTemplate,
      )
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
        review_profile: options.reviewProfileId,
        judge_profile: options.judgeProfileId,
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

    for (const stage of stageDefinitions) {
      assertBinaryExists(stage.execution.command, cwd);
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
        preparedRun.options.maxRetries,
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
    preparedRun.options.maxRetries,
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
      attempts: result.attempts,
      failure_reason: result.failure_reason ?? null,
      missing_artifacts: result.missing_artifacts ?? [],
    })),
    judge_ran: judgeResult !== null,
    judge_ok: judgeResult?.success ?? false,
  }, null, 2));

  process.exitCode = runUsable ? 0 : 1;
}

export function printHelp(commandName: string = "review-council"): void {
  console.error(`usage: ${commandName} --target <target> [options]

options:
  --target <target>                       Review target label
  --run-dir <dir>                         Output directory for this run
  --no-claude                             Skip Claude reviewer
  --no-codex                              Skip Codex reviewer
  --skill-paths <paths>                   Comma-separated paths to skill directories
  --review-profile <id>                   Reviewer prompt profile (default: default)
  --judge-profile <id>                    Judge prompt profile (default: default)
  --claude-prompt-template <path>         Override Claude reviewer prompt template
  --codex-prompt-template <path>          Override Codex reviewer prompt template
  --judge-prompt-template <path>          Override judge prompt template
  --skip-judge                            Skip the judge stage
  --skip-html                             Skip HTML rendering
  --open-html                             Open index.html after rendering (macOS)
  --timeout <ms>                          Stage timeout in ms (default: 300000)
  --retries <n>                           Max retries per stage on failure (default: 2)
  --help                                  Show this help output`);
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
