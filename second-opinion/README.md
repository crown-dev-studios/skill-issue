# Second Opinion

Second Opinion is a CLI and companion skill that asks the other local AI CLI to review the current conversation.

Use it when you want a fresh review of the active Claude Code or Codex thread without depending on the truncated in-memory context.

## Requirements

- Node.js 20+
- `claude` and/or `codex` on `PATH`
- reviewer CLIs already authenticated

## Install

Run it directly:

```bash
npx @crown-dev-studios/second-opinion --help
```

This command only works when `@crown-dev-studios/second-opinion` is resolvable by `npx`, which in practice means the package has been published or otherwise installed in a way `npx` can find.

Other install paths:

```bash
npm install -g @crown-dev-studios/second-opinion
second-opinion --help
```

## Quick Start

From the repo whose thread you want to review, pass the source tool and its active session ID explicitly:

```bash
npx @crown-dev-studios/second-opinion --cwd "$PWD" --source claude --session-id "$CLAUDE_SESSION_ID"
npx @crown-dev-studios/second-opinion --cwd "$PWD" --source codex --session-id "$CODEX_THREAD_ID" "check the security implications"
```

The CLI does not auto-detect source or session IDs. The caller is responsible for passing the active tool and its current session/thread ID.

By default, the forwarded context excludes chain-of-thought/reasoning. Opt in only when you explicitly want it:

```bash
second-opinion --cwd "$PWD" --include-thinking
```

## Skill Install

Optional: install the skill docs after the runtime command is already available:

```bash
cp -R ~/src/second-opinion ~/.claude/skills/second-opinion
cp -R ~/src/second-opinion ~/.codex/skills/second-opinion
```

Copying or symlinking the skill directory only makes the slash command discoverable. It does not make `npx @crown-dev-studios/second-opinion` runnable by itself.

The checked-in skill expects the published package command from the caller repo so transcript lookup stays anchored to that repo.

If you want to use the skill before publishing, change the skill command to a path-anchored local checkout, for example:

```bash
pnpm --dir /absolute/path/to/second-opinion start -- --cwd "$PWD"
```

## CLI Options

```
--source claude|codex          Source conversation to review (required)
--session-id <id>              Session/thread ID to review (required)
--reviewer claude|codex        Force reviewer (defaults to the opposite source)
--focus "..."                  Review focus
--cwd <dir>                    Working directory for reviewer execution
--timeout-ms <n>               Reviewer timeout in milliseconds (default: 300000)
--extract-only                 Print the extracted conversation without calling a reviewer
--include-thinking             Include reasoning/chain-of-thought in the forwarded context
--max-chars <n>                Max conversation characters to send (default: 200000)
--help                         Show help
```

## Reviewer Runtime

The built-in reviewer commands are fixed and always use structured stdout:

- Claude: `claude --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p`
- Codex: `codex exec --json --dangerously-bypass-approvals-and-sandbox`

The CLI writes the review prompt to stdin and parses the JSONL stream to return the assistant's final review text.

## Development

```bash
cd ~/src/second-opinion
pnpm install
pnpm test
pnpm run pack:dry-run
```
