# Review Council

Review Council is a small standalone skill repo for multi-agent code review orchestration. It runs Claude, Codex, or other local reviewer CLIs against the same target, collects raw artifacts, runs a judge pass, and renders a static review bundle.

Use it when you want:

- side-by-side raw reviews before creating final todos
- isolated reviewer runs or separate worktrees
- a judge step that confirms, contests, or rejects findings
- a static HTML report plus machine-readable JSON output

## Status

The orchestrator handles the happy path and common failure modes:

- Stage timeouts with two-phase kill (SIGTERM then SIGKILL) prevent hung runs
- Automatic retry with exponential backoff handles transient failures
- Schema validation catches malformed reviewer and judge output
- Interactive prompts from reviewer CLIs are detected and relayed to the user
- Partial reviewer failure still allows the judge to run on available data
- Failed stages surface stderr excerpts and validation errors in the HTML report

## Requirements

- Node.js 20+
- `pnpm` 10.30.3+
- `claude` and/or `codex` on `PATH`
- a Git working tree to review

## Install

```bash
cd ~/src/review-council
pnpm install
pnpm typecheck
```

The repo is now configured to reject `npm install` and `yarn install` via a `preinstall` guard, `packageManager`, and `engines.pnpm`.

Optional: install it as a slash-invocable skill by copying or symlinking this directory:

```bash
cp -R ~/src/review-council ~/.claude/skills/review-council
cp -R ~/src/review-council ~/.codex/skills/review-council
```

## Quick Start

From the project root you want to review:

```bash
~/src/review-council/node_modules/.bin/tsx \
  ~/src/review-council/scripts/orchestrate-review-council.ts \
  --target "staged changes" \
  --claude-command 'claude -p "$(cat {claude_dir}/claude-review-export.md)"' \
  --codex-command 'codex exec -C {codex_worktree} -o {codex_dir}/last-message.txt "$(cat {codex_dir}/codex-review-export.md)"' \
  --judge-command 'claude -p "$(cat {judge_dir}/judge.md)"'
```

That writes a run bundle under `docs/reviews/<timestamp>-review-council/` in the project being reviewed.

Install dependencies with `pnpm`, but invoke the `review-council` repo's own `tsx` binary when reviewing another project so `process.cwd()` stays anchored to the project under review.

Main outputs:

- `judge/summary.md`
- `judge/verdict.json`
- `bundle.json`
- `index.html`

## CLI Options

```
--target <target>                 Review target label (required)
--run-dir <dir>                   Output directory for this run
--claude-command <command>        Shell command for the Claude reviewer
--codex-command <command>         Shell command for the Codex reviewer
--judge-command <command>         Shell command for the judge stage
--claude-worktree <dir>           Claude worktree or cwd
--codex-worktree <dir>            Codex worktree or cwd
--allow-missing-sentinel          Treat exit code 0 as success without done.json
--skip-judge                      Skip the judge stage
--skip-html                       Skip HTML rendering
--open-html                       Open index.html after rendering (macOS)
--timeout <ms>                    Stage timeout in ms (default: 300000)
--retries <n>                     Max retries per stage on failure (default: 2)
```

## Operational Rules

- Use non-interactive reviewer commands when possible. Interactive prompts are detected and relayed to the user, but explicit non-interactive mode is more reliable.
- Keep reviewer artifacts inside the run directory.
- Do not create authoritative files in `todos/` during raw review.
- If you reuse `workflows-review`, run each reviewer in a separate worktree.

## Failure Triage

If a run fails or stalls, inspect:

- `<run>/claude/status.json`
- `<run>/codex/status.json`
- `<run>/judge/status.json`
- each stage's `stdout.log` and `stderr.log`

The `status.json` for each stage includes `exit_code`, `timed_out`, `attempts`, `retried`, and `validation_errors` fields. The HTML report surfaces stderr excerpts and validation errors for failed stages in a diagnostics section.

If a stage exits `0` but does not write `done.json`, the stage is incomplete and the run should be treated as failed.

## Files

- [SKILL.md](SKILL.md)
- [references/cli-integration.md](references/cli-integration.md)
- [references/output-contract.md](references/output-contract.md)
- [scripts/orchestrate-review-council.ts](scripts/orchestrate-review-council.ts)
- [scripts/render-review-html.ts](scripts/render-review-html.ts)
- [scripts/interaction-queue.ts](scripts/interaction-queue.ts)
- [scripts/validate-schema.ts](scripts/validate-schema.ts)
