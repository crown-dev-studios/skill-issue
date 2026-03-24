---
name: second-opinion
description: Get a second opinion on your current conversation from a different AI model. Routes to Claude from Codex and Codex from Claude using a fresh local shell session.
argument-hint: "[optional review focus]"
---

# Second Opinion

Get a second opinion on your current conversation from a different AI model by invoking the other CLI in a fresh local shell session.

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
npx @crown-dev-studios/second-opinion --cwd "$PWD" --source SOURCE --session-id SESSION_ID [--focus "REVIEW_FOCUS"]
```

- The `--focus` flag is only needed if the user specified a custom focus.
- This command requires `@crown-dev-studios/second-opinion` to be resolvable by `npx`. Copying the skill directory alone is not enough.
- When this skill runs inside Claude, pass `--source claude --session-id "${CLAUDE_SESSION_ID}"` so Codex reviews the current Claude session deterministically.
- When this skill runs inside Codex, pass `--source codex --session-id "${CODEX_THREAD_ID}"` so Claude reviews the current Codex thread deterministically.
- The caller must pass both `--source` and `--session-id` explicitly. The CLI does not auto-detect them.
- The script calls the other CLI in a new local `/bin/zsh -lc` subprocess.
- It reads the full session file from disk (not affected by context compaction).
- Timeout is 5 minutes by default. Override with `--timeout-ms` if needed.
- For local development from a source checkout, anchor the command to that checkout, for example `pnpm --dir /absolute/path/to/second-opinion start -- --cwd "$PWD"`.

3. **Present the review**: Show the reviewer's output to the user. Add a brief note about which model reviewed it.

## Options

The script supports these flags for advanced use:

- `--source claude|codex` — Source conversation to review
- `--session-id <id>` — Session or thread ID to review
- `--reviewer claude|codex` — Force which CLI does the review (defaults to the opposite of source)
- `--claude-command <command>` — Override the Claude reviewer command template
- `--codex-command <command>` — Override the Codex reviewer command template
- `--timeout-ms <n>` — Reviewer timeout in milliseconds (default: 300000)
- `--include-thinking` — Include chain-of-thought reasoning in the review context
- `--extract-only` — Just print the extracted conversation without calling a reviewer
- `--max-chars N` — Max conversation characters to send (default: 200000)

Command templates support these placeholders:

- `{prompt_file}` — Shell-escaped path to the rendered review prompt file
- `{cwd}` — Shell-escaped working directory
- `{reviewer}` — Reviewer name (`claude` or `codex`)

Defaults:

- Claude: `claude -p --disable-slash-commands`
- Codex: `codex exec --skip-git-repo-check -`

By default the review prompt is written to the reviewer process over stdin. `{prompt_file}` is still available for custom command templates that want a file-backed prompt.

You can also set `SECOND_OPINION_CLAUDE_COMMAND` or `SECOND_OPINION_CODEX_COMMAND` in the environment instead of passing the flags.

## Deterministic Session Selection

The caller must pass the live session ID for the current tool instead of asking the CLI to infer it.

### Claude

When this skill runs inside Claude, the source transcript must be the current Claude session.

- Use the live Claude session ID provided to the skill as `${CLAUDE_SESSION_ID}`.
- Pass that value explicitly to the review script with `--source claude --session-id`.
- If `${CLAUDE_SESSION_ID}` is unavailable, stop and explain that deterministic Claude transcript selection is not possible in the current environment.

Example:

```bash
npx @crown-dev-studios/second-opinion --cwd "$PWD" --source claude --session-id "${CLAUDE_SESSION_ID}" [--focus "REVIEW_FOCUS"]
```

### Codex

When this skill runs inside Codex, the source transcript must be the current Codex thread.

- Use the live Codex session ID provided to the skill as `${CODEX_THREAD_ID}`.
- Pass that value explicitly to the review script with `--source codex --session-id`.
- If `${CODEX_THREAD_ID}` is unavailable, stop and explain that deterministic Codex transcript selection is not possible in the current environment.

### Implementation Requirements

The review script should resolve sessions from the explicit `--source` and `--session-id` pair provided by the caller. It must not guess from runtime env vars or modification-time heuristics.

## How it works

1. Finds the current session JSONL file on disk:
   - Claude Code: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
   - Codex: `~/.codex/sessions/<year>/<month>/<day>/rollout-<id>.jsonl`
2. Parses all user messages, assistant responses, chain-of-thought, and tool usage
3. Strips system prompts, permission blocks, and injection artifacts
4. Truncates intelligently if the conversation exceeds the context limit (keeps beginning + end)
5. Sends to the other CLI in a fresh local shell session:
   - If in Claude Code → `codex exec` for review
   - If in Codex → `claude -p` for review
6. Returns the structured review
