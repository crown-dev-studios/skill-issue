import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

export type Reviewer = "claude" | "codex";

const DEFAULT_COMMANDS: Record<Reviewer, string> = {
  claude: "claude -p --disable-slash-commands",
  codex: "codex exec --skip-git-repo-check -",
};

const DEFAULT_TIMEOUT_MS = 300_000;

export interface ReviewerOptions {
  cwd: string;
  timeoutMs?: number;
  commandTemplate?: string;
}

export interface ReviewSuccess {
  ok: true;
  text: string;
  command: string;
  reviewer: Reviewer;
}

export interface ReviewFailure {
  ok: false;
  error: string;
  command?: string;
  reviewer: Reviewer;
}

export type ReviewResult = ReviewSuccess | ReviewFailure;

export function buildReviewPrompt(conversation: string, focus?: string): string {
  const focusInstruction = focus
    ? `REVIEW FOCUS: ${focus}

Evaluate the conversation specifically through the lens of: ${focus}
Also note any other critical issues you spot.`
    : `REVIEW FOCUS: Accuracy, Approach, and Completeness

Evaluate on three dimensions:
1. **Accuracy** — Are the facts, code, and technical claims correct? Any hallucinations or errors?
2. **Approach** — Is the chosen approach sound? Are there better alternatives that were missed?
3. **Completeness** — Are there gaps, edge cases, or important considerations that were overlooked?`;

  return `You are a senior technical reviewer providing a second opinion. You have been given a conversation between a user and an AI assistant. Your job is to review the assistant's responses and provide honest, specific feedback.

${focusInstruction}

FORMAT YOUR REVIEW AS:

## Summary
[1-2 sentence overall assessment]

## Findings

### Critical Issues (if any)
[Issues that are factually wrong, dangerous, or would cause significant problems]

### Concerns
[Things that aren't necessarily wrong but deserve attention — suboptimal approaches, missing context, incomplete reasoning]

### What Was Done Well
[Acknowledge what the assistant got right — this calibrates trust]

## Recommendation
[Concise actionable next steps]

---

Here is the conversation to review:

<conversation>
${conversation}
</conversation>

Provide your review now. Be specific — reference exact claims, code, or suggestions. Do not be generic.`;
}

function formatCommand(template: string, context: Record<string, string>): string {
  return template.replaceAll(/\{([a-z_]+)\}/g, (_match, key: string) => {
    const value = context[key];
    if (!value) {
      throw new Error(`missing placeholder in command template: ${key}`);
    }
    return value;
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function callLocalReviewer(
  prompt: string,
  reviewer: Reviewer,
  options: ReviewerOptions
): Promise<ReviewResult> {
  const commandTemplate = options.commandTemplate ?? DEFAULT_COMMANDS[reviewer];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tempDir = await mkdtemp(join(tmpdir(), `second-opinion-${reviewer}-`));
  const promptFile = join(tempDir, `${reviewer}-review-prompt.md`);

  try {
    await writeFile(promptFile, prompt, "utf8");

    const command = formatCommand(commandTemplate, {
      prompt_file: shellQuote(promptFile),
      cwd: shellQuote(options.cwd),
      reviewer,
    });
    return await new Promise((resolve) => {
      const child = spawn("/bin/zsh", ["-lc", command], {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.stdin.write(prompt);
      child.stdin.end();

      const timeoutId = setTimeout(() => {
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

      child.once("error", (err) => {
        clearTimeout(timeoutId);
        if (killTimer) clearTimeout(killTimer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({
            ok: false,
            error: "Could not launch /bin/zsh for reviewer command.",
            command,
            reviewer,
          });
          return;
        }
        resolve({ ok: false, error: err.message, command, reviewer });
      });

      child.once("close", (code) => {
        clearTimeout(timeoutId);
        if (killTimer) clearTimeout(killTimer);

        if (timedOut) {
          resolve({
            ok: false,
            error: `Review timed out after ${timeoutMs} ms.`,
            command,
            reviewer,
          });
          return;
        }

        if (code === 0) {
          resolve({ ok: true, text: stdout, command, reviewer });
          return;
        }

        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || `Reviewer exited with code ${code ?? 1}.`,
          command,
          reviewer,
        });
      });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function callReviewer(
  prompt: string,
  reviewer: Reviewer,
  options: ReviewerOptions
): Promise<ReviewResult> {
  return callLocalReviewer(prompt, reviewer, options);
}
