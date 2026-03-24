import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { close as closeInteractionQueue, enqueue } from "./interaction-queue.js";
import {
  buildReviewPaths,
  createRunId,
  deriveReviewId,
  isReviewScopedRunDir,
  normalizeReviewTarget,
  validateReviewId,
} from "./review-session.js";
import { renderRunDir } from "./render-review-html.js";
import {
  judgeDoneSchema,
  judgeVerdictSchema,
  reviewDoneSchema,
  reviewFindingsSchema,
} from "./schemas.js";
import type { ValidationError } from "./types.js";
import type { z } from "zod";

type StageName = "claude" | "codex" | "judge";

interface PromptSelection {
  templatePath: string;
  source: string;
  profileId: string;
}

export interface StageDefinition {
  name: StageName;
  displayName: string;
  command?: string;
  stageDir: string;
  promptOutputName: string;
  promptTemplatePath: string;
  promptTemplateSource: string;
  requiredArtifacts: string[];
  jsonArtifactName: "findings.json" | "verdict.json";
  artifactSchema: z.ZodType<{ review_id: string; run_id: string }>;
  doneSchema?: z.ZodType<{ review_id: string; run_id: string }>;
  stageVars: Record<string, string>;
}

export interface StageAttemptResult {
  exitCode: number;
  timedOut: boolean;
  startedAt: string;
  finishedAt: string;
  stdoutPath: string;
  stderrPath: string;
}

interface StageEvaluation {
  success: boolean;
  failureReason?: "process_failed" | "timeout" | "missing_artifacts" | "schema_validation_failed";
  validationErrors?: ValidationError[];
  artifactPresence: Record<string, boolean>;
  missingArtifacts: string[];
}

export interface StageResult {
  name: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  attempts: number;
  failure_reason?: StageEvaluation["failureReason"];
  validation_errors?: ValidationError[];
  missing_artifacts?: string[];
  artifact_presence?: Record<string, boolean>;
}

interface CliOptions {
  target: string;
  reviewId?: string;
  runDir?: string;
  reviewProfileId: string;
  judgeProfileId: string;
  claudePromptTemplate?: string;
  codexPromptTemplate?: string;
  judgePromptTemplate?: string;
  claudeCommand?: string;
  codexCommand?: string;
  judgeCommand?: string;
  allowMissingSentinel: boolean;
  skipJudge: boolean;
  skipHtml: boolean;
  openHtml: boolean;
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
  reviewId: string;
  runId: string;
  judgeEnabled: boolean;
  requireSentinel: boolean;
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

const INTERACTIVE_PROMPT_RE = /(\? |: |> |y\/n|yes\/no)\s*$/i;
const PROMPT_SILENCE_MS = 3000;
const PROMPT_CHECK_INTERVAL_MS = 2000;
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

function cleanupStageFiles(stageDir: string, artifactNames: string[]): void {
  for (const fileName of [
    "stdout.log",
    "stderr.log",
    "status.json",
    "done.json",
    ...artifactNames,
  ]) {
    rmSync(resolve(stageDir, fileName), { force: true, recursive: false });
  }
}

async function runStageOnce(
  name: string,
  command: string,
  stageDir: string,
  workdir: string,
  timeoutMs: number,
  commandEnv: Record<string, string>,
): Promise<StageAttemptResult> {
  const stdoutPath = resolve(stageDir, "stdout.log");
  const stderrPath = resolve(stageDir, "stderr.log");
  const startedAt = nowIso();

  const stdoutFile = createWriteStream(stdoutPath);
  const stderrFile = createWriteStream(stderrPath);
  const child = spawn("/bin/sh", ["-c", command], {
    cwd: workdir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...commandEnv },
  });

  child.stdout.pipe(stdoutFile);
  child.stderr.pipe(stderrFile);

  const rollingBufferSize = 1024;
  let recentOutput = "";
  let lastOutputTime = 0;

  child.stdout.on("data", (chunk: Buffer) => {
    recentOutput = (recentOutput + chunk.toString()).slice(-rollingBufferSize);
    lastOutputTime = Date.now();
  });

  const promptInterval = setInterval(() => {
    if (
      lastOutputTime > 0 &&
      Date.now() - lastOutputTime > PROMPT_SILENCE_MS &&
      INTERACTIVE_PROMPT_RE.test(recentOutput) &&
      child.stdin.writable
    ) {
      const promptText = recentOutput;
      recentOutput = "";
      lastOutputTime = 0;

      enqueue({
        stage: name,
        prompt: promptText,
        stdinPipe: child.stdin,
        resolve: () => {},
      });
    }
  }, PROMPT_CHECK_INTERVAL_MS);

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
  clearInterval(promptInterval);

  try {
    child.stdin.end();
  } catch {
    // The pipe may already be closed.
  }

  stdoutFile.end();
  stderrFile.end();

  await Promise.all([
    finished(stdoutFile),
    finished(stderrFile),
  ]);

  return {
    exitCode,
    timedOut,
    startedAt,
    finishedAt: nowIso(),
    stdoutPath,
    stderrPath,
  };
}

export function evaluateStageArtifacts(
  stage: StageDefinition,
  attempt: StageAttemptResult,
  requireSentinel: boolean,
  reviewId: string,
  runId: string,
): StageEvaluation {
  const artifactPresence: Record<string, boolean> = {};
  const requiredArtifacts = [...stage.requiredArtifacts];
  if (requireSentinel) {
    requiredArtifacts.push("done.json");
  }

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
    };
  }

  if (attempt.exitCode !== 0) {
    return {
      success: false,
      failureReason: "process_failed",
      artifactPresence,
      missingArtifacts,
    };
  }

  if (missingArtifacts.length > 0) {
    return {
      success: false,
      failureReason: "missing_artifacts",
      artifactPresence,
      missingArtifacts,
    };
  }

  const artifactPath = resolve(stage.stageDir, stage.jsonArtifactName);
  try {
    const raw = readJsonFile(artifactPath, stage.jsonArtifactName);
    const parsed = stage.artifactSchema.safeParse(raw);
    const validationErrors: ValidationError[] = [];

    if (!parsed.success) {
      validationErrors.push(...zodToValidationErrors(parsed.error));
    } else {
      if (parsed.data.review_id !== reviewId) {
        validationErrors.push({
          path: "review_id",
          message: `expected review_id "${reviewId}" but received "${parsed.data.review_id}"`,
        });
      }
      if (parsed.data.run_id !== runId) {
        validationErrors.push({
          path: "run_id",
          message: `expected run_id "${runId}" but received "${parsed.data.run_id}"`,
        });
      }
    }

    if (requireSentinel) {
      const donePath = resolve(stage.stageDir, "done.json");
      const doneRaw = readJsonFile(donePath, "done.json");
      if (stage.doneSchema) {
        const doneParsed = stage.doneSchema.safeParse(doneRaw);
        if (!doneParsed.success) {
          validationErrors.push(...zodToValidationErrors(doneParsed.error));
        } else {
          if (doneParsed.data.review_id !== reviewId) {
            validationErrors.push({
              path: "done.review_id",
              message: `expected review_id "${reviewId}" but received "${doneParsed.data.review_id}"`,
            });
          }
          if (doneParsed.data.run_id !== runId) {
            validationErrors.push({
              path: "done.run_id",
              message: `expected run_id "${runId}" but received "${doneParsed.data.run_id}"`,
            });
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        failureReason: "schema_validation_failed",
        validationErrors,
        artifactPresence,
        missingArtifacts,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      failureReason: "schema_validation_failed",
      validationErrors: [{ path: "", message }],
      artifactPresence,
      missingArtifacts,
    };
  }

  return {
    success: true,
    artifactPresence,
    missingArtifacts,
  };
}

function writeStageStatus(
  statusPath: string,
  stage: StageDefinition,
  reviewId: string,
  runId: string,
  command: string,
  attempt: StageAttemptResult,
  evaluation: StageEvaluation,
  requireSentinel: boolean,
  attempts: number,
): void {
  writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        review_id: reviewId,
        run_id: runId,
        stage: stage.name,
        command,
        prompt_template: stage.promptTemplatePath,
        prompt_template_source: stage.promptTemplateSource,
        started_at: attempt.startedAt,
        finished_at: attempt.finishedAt,
        exit_code: attempt.exitCode,
        require_sentinel: requireSentinel,
        done_file_present: evaluation.artifactPresence["done.json"] ?? false,
        required_artifacts: [...stage.requiredArtifacts, ...(requireSentinel ? ["done.json"] : [])],
        artifact_presence: evaluation.artifactPresence,
        missing_artifacts: evaluation.missingArtifacts,
        success: evaluation.success,
        failure_reason: evaluation.failureReason ?? null,
        timed_out: attempt.timedOut,
        attempts,
        retried: attempts > 1,
        validation_errors: evaluation.validationErrors ?? [],
        stdout_log: attempt.stdoutPath,
        stderr_log: attempt.stderrPath,
      },
      null,
      2,
    )}\n`,
  );
}

async function runStage(
  stage: StageDefinition,
  workdir: string,
  requireSentinel: boolean,
  timeoutMs: number,
  maxRetries: number,
  reviewId: string,
  runId: string,
  commandEnv: Record<string, string>,
): Promise<StageResult | null> {
  if (!stage.command) {
    return null;
  }

  const statusPath = resolve(stage.stageDir, "status.json");
  const command = stage.command;

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
    cleanupStageFiles(stage.stageDir, stage.requiredArtifacts);
    lastAttempt = await runStageOnce(stage.name, command, stage.stageDir, workdir, timeoutMs, commandEnv);
    lastEvaluation = evaluateStageArtifacts(stage, lastAttempt, requireSentinel, reviewId, runId);
    writeStageStatus(statusPath, stage, reviewId, runId, command, lastAttempt, lastEvaluation, requireSentinel, attempts);

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
    validation_errors: lastEvaluation.validationErrors,
    missing_artifacts: lastEvaluation.missingArtifacts,
    artifact_presence: lastEvaluation.artifactPresence,
  };
}

function writeLatestRunMarker(reviewDir: string, runDir: string, reviewId: string, runId: string): void {
  writeFileSync(
    resolve(reviewDir, "latest-run.json"),
    `${JSON.stringify(
      {
        review_id: reviewId,
        run_id: runId,
        run_dir: runDir,
        updated_at: nowIso(),
      },
      null,
      2,
    )}\n`,
  );
}

function zodToValidationErrors(error: z.core.$ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function readJsonFile(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse ${label}: ${message}`);
  }
}

export function parseCliOptions(args: string[]): CliOptions | null {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      target: { type: "string" },
      "review-id": { type: "string" },
      "run-dir": { type: "string" },
      "review-profile": { type: "string" },
      "judge-profile": { type: "string" },
      "claude-prompt-template": { type: "string" },
      "codex-prompt-template": { type: "string" },
      "judge-prompt-template": { type: "string" },
      "claude-command": { type: "string" },
      "codex-command": { type: "string" },
      "judge-command": { type: "string" },
      "allow-missing-sentinel": { type: "boolean" },
      "skip-judge": { type: "boolean" },
      "skip-html": { type: "boolean" },
      "open-html": { type: "boolean" },
      timeout: { type: "string" },
      retries: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printHelp();
    return null;
  }

  if (!values.target) {
    console.error("Error: --target is required.");
    printHelp();
    process.exitCode = 1;
    return null;
  }

  const timeoutMs = values.timeout ? parseInt(values.timeout, 10) : DEFAULT_TIMEOUT_MS;
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    console.error(`Invalid --timeout: "${values.timeout}". Must be a positive integer (ms).`);
    process.exitCode = 1;
    return null;
  }

  const maxRetries = values.retries ? parseInt(values.retries, 10) : DEFAULT_MAX_RETRIES;
  if (Number.isNaN(maxRetries) || maxRetries < 0) {
    console.error(`Invalid --retries: "${values.retries}". Must be a non-negative integer.`);
    process.exitCode = 1;
    return null;
  }

  if (!values["claude-command"] && !values["codex-command"]) {
    console.error("At least one reviewer command must be configured via --claude-command and/or --codex-command.");
    process.exitCode = 1;
    return null;
  }

  return {
    target: values.target,
    reviewId: values["review-id"],
    runDir: values["run-dir"],
    reviewProfileId: values["review-profile"] ?? "default",
    judgeProfileId: values["judge-profile"] ?? "default",
    claudePromptTemplate: values["claude-prompt-template"],
    codexPromptTemplate: values["codex-prompt-template"],
    judgePromptTemplate: values["judge-prompt-template"],
    claudeCommand: values["claude-command"],
    codexCommand: values["codex-command"],
    judgeCommand: values["judge-command"],
    allowMissingSentinel: values["allow-missing-sentinel"] ?? false,
    skipJudge: values["skip-judge"] ?? false,
    skipHtml: values["skip-html"] ?? false,
    openHtml: values["open-html"] ?? false,
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
  commands: Record<StageName, string | undefined>,
  reviewTarget: string,
  reviewId: string,
  runId: string,
  reviewSchemaPath: string,
  judgeSchemaPath: string,
): StageDefinition[] {
  const reviewerStages: StageDefinition[] = [
    {
      name: "claude",
      displayName: "Claude",
      command: commands.claude,
      stageDir: paths.claudeDir,
      promptOutputName: "claude-review-export.md",
      promptTemplatePath: promptSelections.claude.templatePath,
      promptTemplateSource: promptSelections.claude.source,
      requiredArtifacts: ["report.md", "findings.json"],
      jsonArtifactName: "findings.json",
      artifactSchema: reviewFindingsSchema,
      doneSchema: reviewDoneSchema,
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        REVIEW_ID: reviewId,
        RUN_ID: runId,
        REVIEW_DIR: paths.reviewDir,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.claudeDir,
        SCHEMA_PATH: reviewSchemaPath,
        REVIEWER_NAME: "Claude",
        REVIEWER_NAME_LOWER: "claude",
      },
    },
    {
      name: "codex",
      displayName: "Codex",
      command: commands.codex,
      stageDir: paths.codexDir,
      promptOutputName: "codex-review-export.md",
      promptTemplatePath: promptSelections.codex.templatePath,
      promptTemplateSource: promptSelections.codex.source,
      requiredArtifacts: ["report.md", "findings.json"],
      jsonArtifactName: "findings.json",
      artifactSchema: reviewFindingsSchema,
      doneSchema: reviewDoneSchema,
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        REVIEW_ID: reviewId,
        RUN_ID: runId,
        REVIEW_DIR: paths.reviewDir,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.codexDir,
        SCHEMA_PATH: reviewSchemaPath,
        REVIEWER_NAME: "Codex",
        REVIEWER_NAME_LOWER: "codex",
      },
    },
  ];

  if (!promptSelections.judge) {
    return reviewerStages;
  }

  return [
    ...reviewerStages,
    {
      name: "judge",
      displayName: "Judge",
      command: commands.judge,
      stageDir: paths.judgeDir,
      promptOutputName: "judge.md",
      promptTemplatePath: promptSelections.judge.templatePath,
      promptTemplateSource: promptSelections.judge.source,
      requiredArtifacts: ["summary.md", "verdict.json"],
      jsonArtifactName: "verdict.json",
      artifactSchema: judgeVerdictSchema,
      doneSchema: judgeDoneSchema,
      stageVars: {
        TARGET: reviewTarget,
        REVIEW_TARGET: reviewTarget,
        REVIEW_ID: reviewId,
        RUN_ID: runId,
        REVIEW_DIR: paths.reviewDir,
        RUN_DIR: paths.runDir,
        ARTIFACT_DIR: paths.judgeDir,
        SCHEMA_PATH: judgeSchemaPath,
      },
    },
  ];
}

function writeRunMetadata(preparedRun: PreparedRun): void {
  const {
    options,
    cwd,
    packageDir,
    reviewTarget,
    reviewId,
    runId,
    judgeEnabled,
    paths,
    promptSelections,
  } = preparedRun;

  writeFileSync(
    resolve(paths.runDir, "run.json"),
    `${JSON.stringify(
      {
        review_id: reviewId,
        run_id: runId,
        review_target: reviewTarget,
        created_at: nowIso(),
        cwd,
        skill_dir: packageDir,
        review_dir: paths.reviewDir,
        run_dir: paths.runDir,
        review_id_source: options.reviewId ? "explicit" : "derived",
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
        command_templates: {
          claude: options.claudeCommand ?? null,
          codex: options.codexCommand ?? null,
          judge: judgeEnabled ? options.judgeCommand ?? null : null,
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
  const reviewId = options.reviewId ?? deriveReviewId(cwd, reviewTarget);
  const reviewIdError = validateReviewId(reviewId);
  if (reviewIdError) {
    console.error(`Invalid --review-id "${reviewId}": ${reviewIdError}`);
    process.exitCode = 1;
    return null;
  }

  const runId = createRunId();
  const paths = buildReviewPaths(cwd, reviewId, runId, options.runDir);
  const judgeEnabled = !options.skipJudge && Boolean(options.judgeCommand);

  let promptSelections: PromptSelections;
  try {
    promptSelections = resolvePromptSelections(packageDir, options, judgeEnabled);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }

  for (const dir of [paths.reviewDir, paths.runDir, paths.claudeDir, paths.codexDir, paths.judgeDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const reviewSchemaPath = resolve(packageDir, "schemas", "review-findings.schema.json");
  const judgeSchemaPath = resolve(packageDir, "schemas", "judge-verdict.schema.json");
  const commandEnv: Record<string, string> = {
    CWD: cwd,
    SKILL_DIR: packageDir,
    REVIEW_ID: reviewId,
    RUN_ID: runId,
    REVIEW_DIR: paths.reviewDir,
    RUN_DIR: paths.runDir,
    CLAUDE_DIR: paths.claudeDir,
    CODEX_DIR: paths.codexDir,
    JUDGE_DIR: paths.judgeDir,
    REVIEW_SCHEMA: reviewSchemaPath,
    JUDGE_SCHEMA: judgeSchemaPath,
  };

  const rawCommands: Record<StageName, string | undefined> = {
    claude: options.claudeCommand,
    codex: options.codexCommand,
    judge: judgeEnabled ? options.judgeCommand : undefined,
  };

  const stageDefinitions = createStageDefinitions(
    paths,
    promptSelections,
    rawCommands,
    reviewTarget,
    reviewId,
    runId,
    reviewSchemaPath,
    judgeSchemaPath,
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
    reviewId,
    runId,
    judgeEnabled,
    requireSentinel: !options.allowMissingSentinel,
    paths,
    promptSelections,
    commandEnv,
    stageDefinitions,
  });

  for (const command of Object.values(rawCommands)) {
    if (command) {
      assertBinaryExists(command, cwd);
    }
  }

  return {
    options,
    cwd,
    packageDir,
    reviewTarget,
    reviewId,
    runId,
    judgeEnabled,
    requireSentinel: !options.allowMissingSentinel,
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
        preparedRun.requireSentinel,
        preparedRun.options.timeoutMs,
        preparedRun.options.maxRetries,
        preparedRun.reviewId,
        preparedRun.runId,
        preparedRun.commandEnv,
      ),
    ),
  );

  closeInteractionQueue();

  const reviewerResults = results.filter(
    (result): result is StageResult => result !== null,
  );
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
    preparedRun.requireSentinel,
    preparedRun.options.timeoutMs,
    preparedRun.options.maxRetries,
    preparedRun.reviewId,
    preparedRun.runId,
    preparedRun.commandEnv,
  );
}

function finalizeRun(
  preparedRun: PreparedRun,
  reviewerExecution: ReviewerExecution,
  judgeResult: StageResult | null,
): void {
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
  if (runUsable && isReviewScopedRunDir(preparedRun.paths)) {
    writeLatestRunMarker(preparedRun.paths.reviewDir, preparedRun.paths.runDir, preparedRun.reviewId, preparedRun.runId);
  }

  console.log(JSON.stringify({
    review_id: preparedRun.reviewId,
    run_id: preparedRun.runId,
    review_dir: preparedRun.paths.reviewDir,
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
      validation_errors: result.validation_errors ?? [],
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
  --review-id <id>                        Stable review identifier
  --run-dir <dir>                         Output directory for this run
  --review-profile <id>                   Reviewer prompt profile (default: default)
  --judge-profile <id>                    Judge prompt profile (default: default)
  --claude-prompt-template <path>         Override Claude reviewer prompt template
  --codex-prompt-template <path>          Override Codex reviewer prompt template
  --judge-prompt-template <path>          Override judge prompt template
  --claude-command <command>              Shell command to launch Claude reviewer
  --codex-command <command>               Shell command to launch Codex reviewer
  --judge-command <command>               Shell command to launch the judge stage

environment variables available in commands:
  $CWD, $SKILL_DIR, $REVIEW_ID, $RUN_ID, $REVIEW_DIR, $RUN_DIR,
  $CLAUDE_DIR, $CODEX_DIR, $JUDGE_DIR, $REVIEW_SCHEMA, $JUDGE_SCHEMA
  --allow-missing-sentinel                Treat exit code 0 as success without done.json
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
