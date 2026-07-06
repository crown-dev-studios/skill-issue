import { spawn } from "node:child_process";

export type Reviewer = "claude" | "codex";

const DEFAULT_TIMEOUT_MS = 300_000;

export interface ReviewerOptions {
  cwd: string;
  timeoutMs?: number;
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

interface ReviewerInvocation {
  executable: string;
  args: string[];
}

type JsonRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteCommandPart(value: string): string {
  return /^[A-Za-z0-9_./:=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCommand(executable: string, args: string[]): string {
  return [executable, ...args].map(quoteCommandPart).join(" ");
}

function createReviewerInvocation(reviewer: Reviewer): ReviewerInvocation {
  if (reviewer === "claude") {
    return {
      executable: "claude",
      args: [
        "--dangerously-skip-permissions",
        "--verbose",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "-p",
      ],
    };
  }

  return {
    executable: "codex",
    args: ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox"],
  };
}

function extractTextBlocks(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    const type = typeof block.type === "string" ? block.type : "";
    if ((type === "text" || type === "output_text") && typeof block.text === "string") {
      parts.push(block.text);
    }
  }

  return parts.join("");
}

function collectAssistantMessages(node: unknown, messages: string[]): void {
  if (!isRecord(node)) {
    return;
  }

  if (node.role === "assistant") {
    const text = extractTextBlocks(node.content);
    if (text.trim()) {
      messages.push(text);
    }
  }

  for (const key of ["message", "payload", "item", "response", "delta"]) {
    collectAssistantMessages(node[key], messages);
  }
}

function collectTextDeltas(node: unknown, fragments: string[]): void {
  if (!isRecord(node)) {
    return;
  }

  const type = typeof node.type === "string" ? node.type : "";
  if ((type === "text_delta" || type === "output_text_delta") && typeof node.text === "string") {
    fragments.push(node.text);
  }

  for (const key of ["message", "payload", "item", "response", "delta"]) {
    collectTextDeltas(node[key], fragments);
  }
}

function extractStructuredReview(stdout: string): string | null {
  const messages: string[] = [];
  const deltas: string[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    collectAssistantMessages(parsed, messages);
    collectTextDeltas(parsed, deltas);
  }

  const message = messages.at(-1)?.trim();
  if (message) {
    return message;
  }

  const deltaText = deltas.join("").trim();
  return deltaText || null;
}

async function callLocalReviewer(
  prompt: string,
  reviewer: Reviewer,
  options: ReviewerOptions
): Promise<ReviewResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const invocation = createReviewerInvocation(reviewer);
  const command = formatCommand(invocation.executable, invocation.args);

  return await new Promise((resolve) => {
    const child = spawn(invocation.executable, invocation.args, {
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
          error: `Could not launch ${invocation.executable}. Make sure it is installed and on PATH.`,
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

      const text = extractStructuredReview(stdout);

      if (code === 0 && text) {
        resolve({ ok: true, text, command, reviewer });
        return;
      }

      if (code === 0) {
        resolve({
          ok: false,
          error: "Reviewer exited successfully but did not emit a structured assistant review.",
          command,
          reviewer,
        });
        return;
      }

      resolve({
        ok: false,
        error: stderr.trim() || text || `Reviewer exited with code ${code ?? 1}.`,
        command,
        reviewer,
      });
    });
  });
}

export function callReviewer(
  prompt: string,
  reviewer: Reviewer,
  options: ReviewerOptions
): Promise<ReviewResult> {
  return callLocalReviewer(prompt, reviewer, options);
}
