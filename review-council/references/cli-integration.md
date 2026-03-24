# CLI Integration

The orchestrator accepts literal shell commands via `--claude-command`, `--codex-command`, and `--judge-command`. Context values are passed as environment variables to each child process.

Point reviewer CLIs at the rendered prompt files created inside the run directory. This keeps the command templates self-contained and avoids depending on any external `/review-export` command.

Pass `--review-id` explicitly when you want run output that is easy to correlate across reruns.

Available environment variables:

- `$CWD`
- `$SKILL_DIR`
- `$REVIEW_ID`
- `$RUN_ID`
- `$REVIEW_DIR`
- `$RUN_DIR`
- `$CLAUDE_DIR`
- `$CODEX_DIR`
- `$JUDGE_DIR`
- `$REVIEW_SCHEMA`
- `$JUDGE_SCHEMA`

These variables are set in the child process environment. Use standard shell quoting (`"$VAR"`) in command templates.

Review targets are available in the rendered prompt templates, but not as environment variables. Keep target text in prompt files rather than interpolating it into reviewer or judge command strings.

The orchestrator renders these prompt files before launching any stage:

- `$CLAUDE_DIR/claude-review-export.md`
- `$CODEX_DIR/codex-review-export.md`
- `$JUDGE_DIR/judge.md`

When invoking the orchestrator from the project being reviewed, prefer the published package command:

```bash
npx @crown-dev-studios/review-council --help
```

If the package is already installed, `review-council --help` is equivalent. Invoking the command from the project under review keeps `process.cwd()` anchored there, so the default output path lands in `docs/reviews/` for that project.

## Recommended Mode

Use raw-review prompts that export findings into the run directory.

### Claude

Claude supports non-interactive `-p` and built-in `--worktree`.

Reviewer commands should already be authenticated and must not require interactive approvals or follow-up answers.

Example:

```bash
claude -p --disable-slash-commands --permission-mode acceptEdits \
  "$(cat "$CLAUDE_DIR/claude-review-export.md")" < /dev/null
```

Use `--disable-slash-commands --permission-mode acceptEdits` for artifact-writing review flows, and redirect stdin from `/dev/null` when the stage is fully headless. This keeps Claude in print mode, disables skills, allows artifact writes without interactive approval prompts, and avoids stdin wait warnings.

If you want Claude to create an isolated Git worktree, add `--worktree <name>` to the Claude command itself. `review-council` does not own reviewer cwd or worktree paths; that stays inside the raw command you pass.

### Codex

Codex supports:

- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex exec`

For exact staged-only review, prefer `codex exec` with an explicit prompt.

Example:

```bash
codex exec --sandbox workspace-write -o "$CODEX_DIR/last-message.txt" \
  "$(cat "$CODEX_DIR/codex-review-export.md")"
```

Codex reviewer and judge commands must run with a writable sandbox because they need to write artifacts into the stage directory.

## Minimal-Change Mode

If you want to keep using `workflows-review` unchanged:

1. Create a separate worktree per reviewer
2. Run `workflows-review` inside each worktree
3. Let each reviewer write to that worktree's local `todos/`
4. Harvest those todo files into `docs/reviews/<run>/`
5. Judge the normalized findings afterward

This works, but the cleaner long-term shape is export-only reviewer artifacts plus final todo creation after the judge.

## Orchestrator Example

```bash
npx @crown-dev-studios/review-council \
  --target "branch main..feature/review-council" \
  --review-id branch-main-feature-review-council \
  --claude-command 'claude -p --disable-slash-commands --permission-mode acceptEdits --worktree review-council-claude "$(cat "$CLAUDE_DIR/claude-review-export.md")" < /dev/null' \
  --codex-command 'codex exec --sandbox workspace-write -o "$CODEX_DIR/last-message.txt" "$(cat "$CODEX_DIR/codex-review-export.md")"' \
  --judge-command 'codex exec --sandbox workspace-write -o "$JUDGE_DIR/last-message.txt" "$(cat "$JUDGE_DIR/judge.md")"'
```

## Resilience Options

### Timeout

`--timeout <ms>` (default: 300000 — 5 minutes) sets a per-stage deadline. On timeout:

1. The child process receives `SIGTERM`
2. After a 5-second grace period, `SIGKILL` is sent if the process hasn't exited
3. The stage result records `exit_code: 124` and `timed_out: true`

Timed-out stages are not retried.

### Retries

`--retries <n>` (default: 2) retries a stage up to N times on non-zero exit. Delay between retries uses exponential backoff: `2000 * 2^(attempt-1)` ms (2s, 4s, 8s...). The final `status.json` records `attempts` and `retried` fields.

Retries are skipped for timeouts (not transient).

### Interactive Prompt Detection

The orchestrator monitors each reviewer's stdout for prompt-like output (lines ending with `? `, `: `, `> `, or containing `y/n`, `yes/no`) followed by 3 seconds of silence. When detected, the prompt is relayed to the user's terminal and the response is piped back to the child's stdin.

If both reviewers prompt simultaneously, questions are queued and presented one at a time.

This is a best-effort safety net. Prefer explicit non-interactive mode (`claude -p --disable-slash-commands --permission-mode acceptEdits < /dev/null`, `codex exec`) when possible.

### Schema Validation

After each successful process exit, the orchestrator requires the full artifact set (`report.md` + `findings.json` for reviewers, `summary.md` + `verdict.json` for the judge, plus `done.json` unless `--allow-missing-sentinel` is set). It then validates the JSON artifact against its schema. Missing artifacts and validation failures both mark the stage as failed in `status.json`.

### Partial Judge Execution

The judge runs if at least one reviewer succeeded. The final JSON summary includes a `reviewers_partial` flag and per-reviewer result details.

### Skip Judge

`--skip-judge` disables judge prompt rendering, judge command validation, and judge execution. This makes reviewer-only runs independent of any configured judge binary.

### Judge Inputs

The judge template always names the reviewer artifact paths it can inspect. If a listed reviewer directory does not exist in a run, that reviewer did not run and its files should be ignored.

## Sentinel Contract

The orchestrator waits for:

- reviewer exit code `0`
- reviewer `done.json`
- judge exit code `0`
- judge `done.json`

If a process exits `0` but omits `done.json`, the stage is treated as incomplete.

## Development Runtime

The supported consumer runtime is the published package. For local development from a source checkout:

```bash
cd ~/src/review-council
pnpm install
pnpm typecheck
pnpm test
pnpm verify:package
```

Package scripts are defined in `package.json`:

- `pnpm review-council:orchestrate`
- `pnpm review-council:render`
- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:package`

Those scripts are for contributors working inside the package repo itself. For reviewing another project, prefer the published package command above so the docs, package metadata, and runtime contract all stay aligned.
