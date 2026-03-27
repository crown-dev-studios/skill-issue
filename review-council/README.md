# Review Council

Review Council is a standalone skill repo for model-parallel code review. It runs Claude and Codex in parallel with selected skill references (architecture-review, testing-philosophy, plan-compliance) passed into reviewer prompts as additional review lenses, then synthesizes all findings through an LLM judge with semantic deduplication, contradiction detection, and dependency ordering.

Use it when you want:

- model-parallel review where Claude and Codex each independently apply specialized review skills
- a judge that deduplicates across both models, detects contradictions, and orders findings by dependency
- automated self-review integrated into agentic workflows

## Status

The orchestrator handles the happy path and common failure modes:

- Stage timeouts with two-phase kill (SIGTERM then SIGKILL) prevent hung runs
- Automatic retry with exponential backoff handles transient failures
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
npx @crown-dev-studios/review-council --target "staged changes" --open-html
```

## Quick Start

From the project root you want to review:

```bash
npx @crown-dev-studios/review-council \
  --target "staged changes" \
  --open-html
```

That's it. Claude + Codex review in parallel, Codex judge, HTML report opens in your browser. Output goes to `docs/reviews/<run-id>/`.

Main outputs:

- `judge/summary.md`
- `judge/verdict.json`
- `follow-ups.md`
- `bundle.json`
- `index.html`

## CLI Options

```
--target <target>                 Review target label (required)
--run-dir <dir>                   Output directory for this run
--no-claude                       Skip Claude reviewer
--no-codex                        Skip Codex reviewer
--skip-judge                      Skip the judge stage
--skill-paths <paths>             Comma-separated paths to skill directories
--open-html                       Open index.html after rendering (macOS)
--skip-html                       Skip HTML rendering
--timeout <ms>                    Stage timeout in ms (default: 300000)
--retries <n>                     Max retries per stage on failure (default: 2)
```

### Overrides (optional)

```
--claude-command <command>        Override default Claude reviewer command
--codex-command <command>         Override default Codex reviewer command
--judge-command <command>         Override default judge command
--allow-missing-sentinel          Treat exit code 0 as success without done.json
```

## Operational Rules

- Use non-interactive reviewer commands when possible. Interactive prompts are detected and relayed to the user, but explicit non-interactive mode is more reliable.
- Keep reviewer artifacts inside the run directory.
- Selected skills are passed into reviewer prompts as additional review lenses for the run; the orchestrator does not inline local `SKILL.md` contents.
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

## Publishing (maintainers)

Canonical release version lives in the [`VERSION`](VERSION) file and must match `version` in [`package.json`](package.json).

**Prerequisites**

- [`npm login`](https://docs.npmjs.com/cli/v11/commands/npm-login) (or another auth method `pnpm publish` can use for the public registry)
- A **clean** git working tree in this repository
- Git tag `vX.Y.Z` present locally before deploy (created by the bump script or manually)
- Permission to publish `@crown-dev-studios/review-council` on npm

**Scripts (same idea as `simple-auth`)**

| Step | Command |
|------|---------|
| Preflight only (build, test, pack dry-run) | `pnpm run release:preflight` or `./scripts/prepare-release.sh` |
| Confirm `VERSION` ↔ `package.json` | `pnpm run release:check-version` or `./scripts/check-version.sh` |
| Require local tag exists | `./scripts/check-version.sh --require-tag` |
| Bump version, refresh lockfile, commit + tag (+ push) | `pnpm run release:bump -- patch` (or `major` / `minor` / `1.2.3`) |
| Publish to npm | `pnpm run release:deploy` or `./scripts/deploy.sh` |

**Typical release**

1. `./scripts/bump-version.sh patch` — updates `VERSION`, `package.json`, `pnpm-lock.yaml`, commits, tags `v…`, pushes (omit `--no-push` / `--no-tag` as needed).
2. `./scripts/check-version.sh --require-tag`
3. `./scripts/deploy.sh --dry-run` (optional)
4. `./scripts/deploy.sh` — pushes branch + tag (unless `--skip-git`), runs install/build/test/verify, then `pnpm publish --access public`.

Options: `./scripts/deploy.sh --dry-run` (no push/publish), `./scripts/deploy.sh --skip-git` (publish only; you already pushed).

Update [`package.json`](package.json) `repository` / `homepage` / `bugs` if the GitHub repo URL differs from `@crown-dev-studios/review-council` on GitHub.

## Files

- [SKILL.md](SKILL.md)
- [references/cli-integration.md](references/cli-integration.md)
- [references/output-contract.md](references/output-contract.md)
- [src/orchestrate-review-council.ts](src/orchestrate-review-council.ts)
- [src/render-review-html.ts](src/render-review-html.ts)
- [src/interaction-queue.ts](src/interaction-queue.ts)
