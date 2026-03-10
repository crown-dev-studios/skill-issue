#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRunDir } from "./render-review-html.ts";
import { enqueue, close as closeInteractionQueue } from "./interaction-queue.ts";
import { validateSchema, type ValidationError } from "./validate-schema.ts";

interface StageResult {
  name: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  attempts: number;
  validation_errors?: ValidationError[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function timestampSlug(): string {
  return nowIso().replaceAll(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function assertBinaryExists(command: string): void {
  const binary = command.trim().split(/\s+/)[0];
  if (!binary) return;
  try {
    execSync(`which "${binary}"`, { stdio: "ignore" });
  } catch {
    throw new Error(`Required binary not found on PATH: ${binary}`);
  }
}

function formatCommand(template: string, context: Record<string, string>): string {
  return template.replaceAll(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = context[key];
    if (!value) {
      throw new Error(`missing placeholder in command template: ${key}`);
    }
    return value;
  });
}

// Markdown prompt templates use {{UPPER_CASE}} placeholders, replaced at stage-setup time.
// HTML templates use __UPPER_CASE__ instead (see render-review-html.ts).
function renderTemplate(
  templatePath: string,
  vars: Record<string, string>,
  outputPath: string,
): string {
  const content = readFileSync(templatePath, "utf8");
  const rendered = content.replaceAll(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
  writeFileSync(outputPath, rendered);
  return outputPath;
}

function renderStageTemplates(
  skillDir: string,
  stageDir: string,
  stageVars: Record<string, string>,
): void {
  const templateDir = resolve(skillDir, "templates");

  // Reviewer stages use the unified reviewer-export.md template
  const reviewerTemplate = resolve(templateDir, "reviewer-export.md");
  if (existsSync(reviewerTemplate) && stageVars.REVIEWER_NAME) {
    const outputName = `${stageVars.REVIEWER_NAME_LOWER}-review-export.md`;
    renderTemplate(reviewerTemplate, stageVars, resolve(stageDir, outputName));
  }

  // Judge uses its own template
  const judgeTemplate = resolve(templateDir, "judge.md");
  if (existsSync(judgeTemplate)) {
    renderTemplate(judgeTemplate, stageVars, resolve(stageDir, "judge.md"));
  }
}

const INTERACTIVE_PROMPT_RE = /(\? |: |> |y\/n|yes\/no)\s*$/i;
const PROMPT_SILENCE_MS = 3000;
const PROMPT_CHECK_INTERVAL_MS = 2000;

function patchStatusJson(statusPath: string, patch: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown>;
  } catch { /* missing or malformed — start fresh */ }
  writeFileSync(statusPath, `${JSON.stringify({ ...existing, ...patch }, null, 2)}\n`);
}

async function runStageOnce(
  name: string,
  command: string,
  stageDir: string,
  workdir: string,
  requireSentinel: boolean,
  timeoutMs: number,
): Promise<{ exitCode: number; timed_out: boolean }> {
  const stdoutPath = resolve(stageDir, "stdout.log");
  const stderrPath = resolve(stageDir, "stderr.log");
  const donePath = resolve(stageDir, "done.json");
  const statusPath = resolve(stageDir, "status.json");
  const startedAt = nowIso();

  const stdoutFile = createWriteStream(stdoutPath);
  const stderrFile = createWriteStream(stderrPath);
  const child = spawn("/bin/zsh", ["-lc", command], {
    cwd: workdir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.pipe(stdoutFile);
  child.stderr.pipe(stderrFile);

  // --- Interactive prompt detection ---
  // Rolling buffer keeps last 1KB to avoid missing prompts split across chunks
  const ROLLING_BUFFER_SIZE = 1024;
  let recentOutput = "";
  let lastOutputTime = 0;

  child.stdout.on("data", (chunk: Buffer) => {
    recentOutput = (recentOutput + chunk.toString()).slice(-ROLLING_BUFFER_SIZE);
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
        resolve: () => { /* interaction done */ },
      });
    }
  }, PROMPT_CHECK_INTERVAL_MS);

  // --- Two-phase kill timeout ---
  let timed_out = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutTimer = setTimeout(() => {
    timed_out = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
    }, 5000);
  }, timeoutMs);

  const exitCode = await new Promise<number>((resolveExit) => {
    child.once("error", () => resolveExit(1));
    child.once("close", (code) => resolveExit(timed_out ? 124 : (code ?? 1)));
  });

  clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
  clearInterval(promptInterval);

  // Close stdin if still open
  try { child.stdin.end(); } catch { /* may already be closed */ }

  stdoutFile.end();
  stderrFile.end();

  // Wait for write streams to finish flushing to avoid truncated logs
  await Promise.all([
    new Promise<void>((r) => stdoutFile.on("finish", r)),
    new Promise<void>((r) => stderrFile.on("finish", r)),
  ]);

  const success = exitCode === 0 && (existsSync(donePath) || !requireSentinel);
  writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        stage: name,
        command,
        started_at: startedAt,
        finished_at: nowIso(),
        exit_code: exitCode,
        require_sentinel: requireSentinel,
        done_file_present: existsSync(donePath),
        success,
        timed_out,
        stdout_log: stdoutPath,
        stderr_log: stderrPath,
      },
      null,
      2,
    )}\n`,
  );

  return { exitCode, timed_out };
}

async function runStage(
  name: string,
  commandTemplate: string | undefined,
  context: Record<string, string>,
  workdir: string,
  requireSentinel: boolean,
  timeoutMs: number,
  maxRetries: number,
  schemaPath?: string,
): Promise<StageResult | null> {
  if (!commandTemplate) {
    return null;
  }

  const stageDir = context[`${name}_dir`];
  const statusPath = resolve(stageDir, "status.json");
  const donePath = resolve(stageDir, "done.json");
  const command = formatCommand(commandTemplate, context);

  let lastExitCode = 1;
  let lastTimedOut = false;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1);
      process.stderr.write(`[${name}] retry ${attempt}/${maxRetries} in ${delayMs}ms\n`);
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }

    attempts = attempt + 1;
    const result = await runStageOnce(name, command, stageDir, workdir, requireSentinel, timeoutMs);
    lastExitCode = result.exitCode;
    lastTimedOut = result.timed_out;

    const success = lastExitCode === 0 && (existsSync(donePath) || !requireSentinel);

    if (success) break;

    // Don't retry on timeout (safety net, not transient) or if sentinel file is present but exit non-zero
    if (lastTimedOut) break;
  }

  // Record attempts in status.json
  patchStatusJson(statusPath, { attempts, retried: attempts > 1 });

  const success = lastExitCode === 0 && (existsSync(donePath) || !requireSentinel);

  // --- Schema validation ---
  let validation_errors: ValidationError[] | undefined;
  if (success && schemaPath) {
    const artifactName = name === "judge" ? "verdict.json" : "findings.json";
    const artifactPath = resolve(stageDir, artifactName);
    if (existsSync(artifactPath) && existsSync(schemaPath)) {
      try {
        const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
        const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
        const errors = validateSchema(artifact, schema);
        if (errors.length > 0) {
          validation_errors = errors;
        }
      } catch {
        validation_errors = [{ path: "", message: "failed to parse artifact or schema JSON" }];
      }

      if (validation_errors) {
        patchStatusJson(statusPath, { success: false, validation_errors });
        return { name, exit_code: lastExitCode, success: false, timed_out: lastTimedOut, attempts, validation_errors };
      }
    }
  }

  return {
    name,
    exit_code: lastExitCode,
    success,
    timed_out: lastTimedOut,
    attempts,
    validation_errors,
  };
}

function printHelp(): void {
  console.log(`usage: orchestrate-review-council.ts --target <target> [options]

options:
  --target <target>                 Review target label
  --run-dir <dir>                   Output directory for this run
  --claude-command <command>        Shell command used to launch Claude reviewer
  --codex-command <command>         Shell command used to launch Codex reviewer
  --judge-command <command>         Shell command used to launch the judge stage
  --claude-worktree <dir>           Claude worktree or cwd
  --codex-worktree <dir>            Codex worktree or cwd
  --allow-missing-sentinel          Treat exit code 0 as success without done.json
  --skip-judge                      Skip the judge stage
  --skip-html                       Skip HTML rendering
  --open-html                       Open index.html after rendering (macOS)
  --timeout <ms>                    Stage timeout in ms (default: 300000)
  --retries <n>                     Max retries per stage on failure (default: 2)
  --help                            Show this help output`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      target: { type: "string" },
      "run-dir": { type: "string" },
      "claude-command": { type: "string" },
      "codex-command": { type: "string" },
      "judge-command": { type: "string" },
      "claude-worktree": { type: "string" },
      "codex-worktree": { type: "string" },
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
    return;
  }

  const target = values.target;
  if (!target) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const timeoutMs = values.timeout ? parseInt(values.timeout, 10) : 300000;
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    console.error(`Invalid --timeout: "${values.timeout}". Must be a positive integer (ms).`);
    process.exitCode = 1;
    return;
  }
  const maxRetries = values.retries ? parseInt(values.retries, 10) : 2;
  if (Number.isNaN(maxRetries) || maxRetries < 0) {
    console.error(`Invalid --retries: "${values.retries}". Must be a non-negative integer.`);
    process.exitCode = 1;
    return;
  }

  const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const skillDir = resolve(scriptDir, "..");
  const cwd = process.cwd();
  const runDir = values["run-dir"]
    ? resolve(values["run-dir"])
    : resolve(cwd, "docs", "reviews", `${timestampSlug()}-review-council`);
  const claudeDir = resolve(runDir, "claude");
  const codexDir = resolve(runDir, "codex");
  const judgeDir = resolve(runDir, "judge");

  for (const dir of [runDir, claudeDir, codexDir, judgeDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const reviewSchema = resolve(skillDir, "schemas", "review-findings.schema.json");
  const judgeSchema = resolve(skillDir, "schemas", "judge-verdict.schema.json");

  const context: Record<string, string> = {
    cwd,
    skill_dir: skillDir,
    run_dir: runDir,
    target,
    claude_dir: claudeDir,
    codex_dir: codexDir,
    judge_dir: judgeDir,
    claude_worktree: values["claude-worktree"] ? resolve(values["claude-worktree"]) : cwd,
    codex_worktree: values["codex-worktree"] ? resolve(values["codex-worktree"]) : cwd,
    review_schema: reviewSchema,
    judge_schema: judgeSchema,
  };

  // Pre-render templates with concrete values per stage
  const stageTemplateVars: Record<string, Record<string, string>> = {
    claude: { TARGET: target, ARTIFACT_DIR: claudeDir, SCHEMA_PATH: reviewSchema, RUN_DIR: runDir, REVIEWER_NAME: "Claude", REVIEWER_NAME_LOWER: "claude" },
    codex: { TARGET: target, ARTIFACT_DIR: codexDir, SCHEMA_PATH: reviewSchema, RUN_DIR: runDir, REVIEWER_NAME: "Codex", REVIEWER_NAME_LOWER: "codex" },
    judge: { TARGET: target, ARTIFACT_DIR: judgeDir, SCHEMA_PATH: judgeSchema, RUN_DIR: runDir },
  };
  for (const [stage, vars] of Object.entries(stageTemplateVars)) {
    renderStageTemplates(skillDir, context[`${stage}_dir`], vars);
  }

  writeFileSync(
    resolve(runDir, "run.json"),
    `${JSON.stringify(
      {
        target,
        created_at: nowIso(),
        cwd,
        skill_dir: skillDir,
        claude_command_template: values["claude-command"] ?? null,
        codex_command_template: values["codex-command"] ?? null,
        judge_command_template: values["judge-command"] ?? null,
      },
      null,
      2,
    )}\n`,
  );

  // Fail fast if required CLIs are not on PATH
  for (const cmd of [values["claude-command"], values["codex-command"], values["judge-command"]]) {
    if (cmd) assertBinaryExists(cmd);
  }

  const requireSentinel = !values["allow-missing-sentinel"];
  const [claudeResult, codexResult] = await Promise.all([
    runStage("claude", values["claude-command"], context, cwd, requireSentinel, timeoutMs, maxRetries, reviewSchema),
    runStage("codex", values["codex-command"], context, cwd, requireSentinel, timeoutMs, maxRetries, reviewSchema),
  ]);

  closeInteractionQueue();

  const reviewerResults = [claudeResult, codexResult].filter(
    (result): result is StageResult => result !== null,
  );
  const reviewersOk = reviewerResults.every((result) => result.success);
  const reviewersPartial = !reviewersOk && reviewerResults.some((result) => result.success);

  let judgeResult: StageResult | null = null;
  if (!values["skip-judge"] && (reviewersOk || reviewersPartial)) {
    judgeResult = await runStage(
      "judge",
      values["judge-command"],
      context,
      cwd,
      requireSentinel,
      timeoutMs,
      maxRetries,
      judgeSchema,
    );
  }

  if (!values["skip-html"]) {
    renderRunDir(runDir);
  }

  if (values["open-html"] && !values["skip-html"]) {
    const htmlPath = resolve(runDir, "index.html");
    if (existsSync(htmlPath)) {
      spawn("open", [htmlPath], { stdio: "ignore", detached: true }).unref();
    }
  }

  console.log(
    JSON.stringify(
      {
        run_dir: runDir,
        reviewers_ok: reviewersOk,
        reviewers_partial: reviewersPartial,
        reviewers: reviewerResults.map((r) => ({
          name: r.name,
          success: r.success,
          timed_out: r.timed_out,
          exit_code: r.exit_code,
          attempts: r.attempts,
        })),
        judge_ran: judgeResult !== null,
        judge_ok: judgeResult?.success ?? false,
      },
      null,
      2,
    ),
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
