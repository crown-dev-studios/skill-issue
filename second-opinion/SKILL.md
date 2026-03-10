---
name: second-opinion
description: Get a second opinion on your current conversation from a different AI model. Routes to Claude from Codex and Codex from Claude.
argument-hint: "[optional review focus]"
---

# Second Opinion

Get a second opinion on your current conversation from a different AI model by invoking the other CLI.

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

1. **Parse arguments**: If the user provided text after `/second-opinion`, use it as the review focus. If no arguments, the default focus is accuracy, approach, and completeness.

2. **Run the review script**:

```bash
npx tsx ./src/index.ts --cwd "$PWD" [--focus "REVIEW_FOCUS"]
```

- The `--focus` flag is only needed if the user specified a custom focus.
- When this skill runs inside Claude and `${CLAUDE_SESSION_ID}` is available, pass `--source claude --session-id "${CLAUDE_SESSION_ID}"` so Codex reviews the current Claude session deterministically.
- When this skill runs inside Codex, the review script should use `process.env.CODEX_THREAD_ID` automatically for deterministic Codex session selection.
- The script auto-detects whether you're in Claude Code or Codex and calls the other CLI.
- It reads the full session file from disk (not affected by context compaction).
- Timeout is 5 minutes — use `timeout=300000` on the Bash call.

3. **Present the review**: Show the reviewer's output to the user. Add a brief note about which model reviewed it.

## Options

The script supports these flags for advanced use:

- `--source claude|codex` — Force source detection (auto-detected by default)
- `--session-id <id>` — Use an explicit session or thread ID
- `--reviewer claude|codex` — Force which CLI does the review (defaults to the opposite of source)
- `--no-thinking` — Exclude chain-of-thought reasoning from the review context
- `--extract-only` — Just print the extracted conversation without calling a reviewer
- `--max-chars N` — Max conversation characters to send (default: 200000)

## Deterministic Session Selection

Use the live session ID for the current tool instead of guessing from the newest transcript file.

### Claude

When this skill runs inside Claude, the source transcript must be the current Claude session.

- Use the live Claude session ID provided to the skill as `${CLAUDE_SESSION_ID}` when available.
- Pass that value explicitly to the review script with `--session-id`.
- Do not pick the newest file in `~/.claude`.
- Do not rely on `cwd` alone to identify a Claude session, because multiple Claude sessions can exist for the same directory.
- If `${CLAUDE_SESSION_ID}` is unavailable, stop and explain that deterministic Claude transcript selection is not possible in the current environment.

Example:

```bash
npx tsx ./src/index.ts --cwd "$PWD" --source claude --session-id "${CLAUDE_SESSION_ID}" [--focus "REVIEW_FOCUS"]
```

### Codex

When this skill runs inside Codex, the source transcript must be the current Codex thread.

- The review script should read the live Codex session ID from `process.env.CODEX_THREAD_ID`.
- Prefer that ID over any filesystem or modification-time heuristic.
- Only fall back to `cwd`-scoped lookup if `CODEX_THREAD_ID` is unavailable.

### Implementation Requirements

The review script should resolve sessions in this order:

1. Explicit `--session-id`
2. Runtime session ID for the active tool
   - Claude: `${CLAUDE_SESSION_ID}` if available from the skill runtime
   - Codex: `process.env.CODEX_THREAD_ID`
3. Tool-specific fallback lookup

If a session ID is available, it is authoritative and must be used for transcript selection.

## How it works

1. Finds the current session JSONL file on disk:
   - Claude Code: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
   - Codex: `~/.codex/sessions/<year>/<month>/<day>/rollout-<id>.jsonl`
2. Parses all user messages, assistant responses, chain-of-thought, and tool usage
3. Strips system prompts, permission blocks, and injection artifacts
4. Truncates intelligently if the conversation exceeds the context limit (keeps beginning + end)
5. Sends to the other CLI:
   - If in Claude Code → `codex exec` for review
   - If in Codex → `claude -p` for review
6. Returns the structured review
