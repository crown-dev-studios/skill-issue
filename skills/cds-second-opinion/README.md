# Second Opinion

Second Opinion is a skill that asks the other local AI CLI to review the current conversation.

Use it when you want a fresh review of the active Claude Code or Codex thread without depending on the truncated in-memory context.

## How It Runs

The skill is prompt-driven — there is no companion CLI and nothing to build:

- The host agent takes the current session ID from the harness (`$CLAUDE_SESSION_ID` in Claude Code, `$CODEX_THREAD_ID` in Codex) and resolves the transcript path on disk. Session selection is deterministic; if the ID is unavailable the skill stops rather than guessing.
- It renders a reviewer prompt from [templates/reviewer.md](templates/reviewer.md) and spawns the *other* vendor's CLI (`codex exec` from Claude Code, `claude -p` from Codex) as a background process.
- The reviewer reads the on-disk transcript itself with its own tools — selectively, and unaffected by context compaction — and writes its review to a file, which the host relays.
- By default the reviewer is told to skip reasoning/thinking content so the second opinion stays independent.

See [SKILL.md](SKILL.md) for the full workflow.

## Requirements

- An agent harness that exposes the current session ID (Claude Code or Codex)
- The other vendor's CLI on `PATH`, already authenticated

## Files

- [SKILL.md](SKILL.md) — the workflow
- [templates/reviewer.md](templates/reviewer.md) — reviewer prompt template
