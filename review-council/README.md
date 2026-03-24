# Review Council

Review Council is a package-first CLI for multi-agent code review orchestration. It runs Claude, Codex, or other local reviewer CLIs against the same target, collects raw artifacts, runs a judge pass, and renders a static review bundle.

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
- `claude` and/or `codex` on `PATH`
- a Git working tree to review
- reviewer CLIs authenticated and able to run non-interactively when possible

## Install

Run it directly:

```bash
npx @crown-dev-studios/review-council --help
```

Other package install paths:

```bash
pnpm dlx @crown-dev-studios/review-council --help
npm install -g @crown-dev-studios/review-council
review-council --help
```

## Quick Start

From the project root you want to review:

```bash
npx @crown-dev-studios/review-council \
  --target "staged changes" \
  --review-id staged-changes-review \
  --claude-command 'claude -p --disable-slash-commands --permission-mode acceptEdits "$(cat "$CLAUDE_DIR/claude-review-export.md")" < /dev/null' \
  --codex-command 'codex exec --sandbox workspace-write -o "$CODEX_DIR/last-message.txt" "$(cat "$CODEX_DIR/codex-review-export.md")"' \
  --judge-command 'codex exec --sandbox workspace-write -o "$JUDGE_DIR/last-message.txt" "$(cat "$JUDGE_DIR/judge.md")"'
```

That writes a run bundle under `docs/reviews/<review-id>/runs/<run-id>/` in the project being reviewed. Pass `--review-id` explicitly when you want the same review to be easy to correlate across reruns.

Main outputs:

- `judge/summary.md`
- `judge/verdict.json`
- `bundle.json`
- `index.html`

## Skill Install

Optional: install it as a slash-invocable skill by copying or symlinking this directory:

```bash
cp -R ~/src/review-council ~/.claude/skills/review-council
cp -R ~/src/review-council ~/.codex/skills/review-council
```

The skill docs and the published package describe the same runtime: invoke `npx @crown-dev-studios/review-council ...` from the repo you want to review so outputs stay rooted in that caller repo.

## CLI Options

```
--target <target>                 Review target label (required)
--review-id <id>                  Stable review identifier
--run-dir <dir>                   Output directory for this run
--review-profile <id>             Reviewer prompt profile (default: default)
--judge-profile <id>              Judge prompt profile (default: default)
--claude-prompt-template <path>   Override Claude reviewer prompt template
--codex-prompt-template <path>    Override Codex reviewer prompt template
--judge-prompt-template <path>    Override judge prompt template
--claude-command <command>        Shell command for the Claude reviewer
--codex-command <command>         Shell command for the Codex reviewer
--judge-command <command>         Shell command for the judge stage
--allow-missing-sentinel          Treat exit code 0 as success without done.json
--skip-judge                      Skip the judge stage
--skip-html                       Skip HTML rendering
--open-html                       Open index.html after rendering (macOS)
--timeout <ms>                    Stage timeout in ms (default: 300000)
--retries <n>                     Max retries per stage on failure (default: 2)
```

## Operating Notes

- Use non-interactive reviewer commands when possible. Interactive prompts are detected and relayed to the user, but explicit non-interactive mode is more reliable.
- Use `claude -p --disable-slash-commands --permission-mode acceptEdits ... < /dev/null` for Claude reviewer runs. This keeps the run in headless mode, disables skills, allows artifact writes into the stage directory without interactive approval prompts, and prevents Claude from waiting on stdin during fully non-interactive runs.
- Codex reviewer and judge commands must run with a writable sandbox, for example `codex exec --sandbox workspace-write ...`, because they need to write review artifacts into the run directory.
- `--skip-judge` disables judge prompt rendering, judge command validation, and judge execution.
- Keep reviewer artifacts inside the run directory.
- Every reviewer and judge JSON artifact should carry the same `review_id` and `run_id` as `run.json`.
- Do not create authoritative files in `todos/` during raw review.
- If you reuse `workflows-review`, run each reviewer in a separate worktree.

## Failure Triage

If a run fails or stalls, inspect:

- `<run>/claude/status.json`
- `<run>/codex/status.json`
- `<run>/judge/status.json`
- each stage's `stdout.log` and `stderr.log`

The `status.json` for each stage includes `review_id`, `run_id`, `exit_code`, `timed_out`, `attempts`, `missing_artifacts`, `failure_reason`, and `validation_errors`. The HTML report surfaces missing artifacts, stderr excerpts, and validation errors for failed stages in a diagnostics section.

If a stage exits `0` but does not write `done.json`, the stage is incomplete and the run should be treated as failed.

## Development

Contributor workflow from a source checkout:

```bash
cd ~/src/review-council
pnpm install
pnpm typecheck
pnpm test
```

Package verification:

```bash
pnpm verify:package
```

That verification path:

- builds `dist/`
- inspects `npm pack --dry-run` output with a repo-local npm cache
- installs the local tarball into a temporary caller repo
- verifies `review-council --help` and a minimal end-to-end run

First publish and post-publish checks:

```bash
pnpm release:manual
npm view @crown-dev-studios/review-council version
npx @crown-dev-studios/review-council --help
```

## Files

- [SKILL.md](SKILL.md)
- [references/cli-integration.md](references/cli-integration.md)
- [references/output-contract.md](references/output-contract.md)
- [src/cli.ts](src/cli.ts)
- [src/orchestrate-review-council.ts](src/orchestrate-review-council.ts)
- [src/render-review-html.ts](src/render-review-html.ts)
- [src/interaction-queue.ts](src/interaction-queue.ts)
- [src/review-session.ts](src/review-session.ts)
- [src/schemas.ts](src/schemas.ts)
- [src/types.ts](src/types.ts)
- [test/package-smoke.test.mjs](test/package-smoke.test.mjs)
- [test/validate-schema.test.ts](test/validate-schema.test.ts)
