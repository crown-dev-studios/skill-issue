---
name: cds-second-opinion
description: "Get a second opinion on your current conversation from a different AI model. Routes to Claude from Codex and Codex from Claude using a fresh local shell session."
argument-hint: "[optional review focus]"
---

# Second Opinion

Get a second opinion on the current conversation from a different AI model by invoking the other CLI with a pointer to this session's transcript on disk.

## When to use

Invoke with `/second-opinion` mid-conversation when you want another model to review the current conversation's accuracy, approach, or any specific concern.

## Usage

```
/second-opinion [optional review focus]
```

## Examples

```
/second-opinion
/second-opinion is this database schema correct?
/second-opinion check the security implications
/second-opinion are there edge cases I'm missing?
```

## Instructions

When this skill is invoked:

### Step 1: Parse Arguments

If the user provided text after `/second-opinion`, use it as the review focus. If no arguments, the default focus is accuracy, approach, and completeness. If the user asked for the reviewer to see the reasoning/chain-of-thought, note that for Step 4.

### Step 2: Identify the Current Session

The transcript must be the current thread — never guess the session from file modification times.

- Inside Claude Code: the session ID is `${CLAUDE_SESSION_ID}`.
- Inside Codex: the session ID is `${CODEX_THREAD_ID}`.

If the variable for the current environment is unavailable, stop and explain that deterministic transcript selection is not possible here.

### Step 3: Resolve the Transcript Path

- Claude Code session: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where `<encoded-cwd>` is the absolute working directory with `/` replaced by `-`. If that exact path does not exist, search `~/.claude/projects/*/<session-id>.jsonl`.
- Codex session: search `~/.codex/sessions/` (dated subdirectories) for `rollout-*<session-id>*.jsonl`.

Verify the file exists before proceeding; if it cannot be found, stop and report the paths checked.

### Step 4: Render the Reviewer Prompt

Create a scratch directory (`mktemp -d`). Render [reviewer.md](templates/reviewer.md) into `<scratch>/prompt.md`, filling every placeholder:

- `{{REVIEWER_NAME}}` — the reviewing model's CLI (`Codex` when running from Claude Code, `Claude` when running from Codex)
- `{{SOURCE_TOOL}}` — `Claude Code` or `Codex`
- `{{TRANSCRIPT_PATH}}` — absolute path from Step 3
- `{{REVIEW_FOCUS}}` — from Step 1
- `{{OUTPUT_PATH}}` — absolute path to `<scratch>/review.md`

By default the template tells the reviewer to skip reasoning/thinking content so the opinion stays independent; if the user explicitly asked for reasoning to be included, remove that instruction from the rendered prompt.

### Step 5: Invoke the Other CLI

Run the opposite CLI in the background (a review can take several minutes):

- From Claude Code:

  ```bash
  codex exec --dangerously-bypass-approvals-and-sandbox \
    "$(cat "<scratch>/prompt.md")" > "<scratch>/reviewer.log" 2>&1
  ```

- From Codex:

  ```bash
  claude --dangerously-skip-permissions -p \
    "$(cat "<scratch>/prompt.md")" > "<scratch>/reviewer.log" 2>&1
  ```

If the reviewer CLI is not on `PATH`, stop and tell the user which CLI is required.

The run succeeded when `<scratch>/review.md` exists; `reviewer.log` is diagnostic only. If the process exits without writing `review.md`, report the failure with the tail of `reviewer.log` — do not retry silently.

### Step 6: Present the Review

Relay `review.md` to the user, noting which model produced it. Do not soften or re-adjudicate the reviewer's opinion — disagreements are signal.

## How It Works

- The harness provides the current session ID; this skill only turns it into a transcript path.
- The reviewer is a full agent with its own file tools: it reads the on-disk transcript itself (unaffected by context compaction) and selectively, instead of receiving a pre-truncated export.
- There is no companion CLI or build step. The only subprocess is the other vendor's CLI, spawned directly.
