import { execFile } from "node:child_process";

type Reviewer = "claude" | "codex";

export interface ReviewSuccess {
  ok: true;
  text: string;
}

export interface ReviewFailure {
  ok: false;
  error: string;
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

export function callReviewer(prompt: string, reviewer: Reviewer): Promise<ReviewResult> {
  return new Promise((resolve) => {
    let cmd: string;
    let args: string[];

    if (reviewer === "claude") {
      cmd = "claude";
      args = ["-p"];
    } else {
      cmd = "codex";
      args = ["exec", "--skip-git-repo-check", "-"];
    }

    const child = execFile(cmd, args, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // If the process produced output before failing, treat it as a partial success
        if (stdout?.trim()) {
          resolve({ ok: true, text: stdout });
          return;
        }
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ ok: false, error: `'${reviewer}' CLI not found. Make sure it's installed and in your PATH.` });
          return;
        }
        if (err.killed) {
          resolve({ ok: false, error: "Review timed out after 5 minutes." });
          return;
        }
        resolve({ ok: false, error: stderr || err.message });
        return;
      }
      resolve({ ok: true, text: stdout });
    });

    // Write prompt to stdin
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
