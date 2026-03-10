# CLI Integration

The orchestrator script accepts literal CLI commands with placeholders.

Best practice: point reviewer CLIs at the rendered prompt files created inside the run directory. This keeps the command templates self-contained and avoids depending on any external `/review-export` command.

Available placeholders:

- `{cwd}`
- `{skill_dir}`
- `{run_dir}`
- `{target}`
- `{claude_dir}`
- `{codex_dir}`
- `{judge_dir}`
- `{claude_worktree}`
- `{codex_worktree}`
- `{review_schema}`
- `{judge_schema}`

The orchestrator renders these prompt files before launching any stage:

- `{claude_dir}/claude-review-export.md`
- `{codex_dir}/codex-review-export.md`
- `{judge_dir}/judge.md`

When invoking the orchestrator from the project being reviewed, prefer the standalone skill repo's pnpm-installed `tsx` binary directly. That keeps `process.cwd()` anchored to the project under review, so the default output path lands in `docs/reviews/` for that project.

## Recommended Mode

Use raw-review prompts that export findings into the run directory.

### Claude

Claude supports non-interactive `-p` and built-in `--worktree`.

Reviewer commands should already be authenticated and must not require interactive approvals or follow-up answers.

Example:

```bash
claude -p "$(cat {claude_dir}/claude-review-export.md)"
```

If you want Claude to create an isolated Git worktree, add `--worktree <name>` to the Claude command itself. Use `--claude-worktree` only when a custom command template needs a concrete path placeholder.

### Codex

Codex supports:

- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex exec`

For exact staged-only review, prefer `codex exec` with an explicit prompt.

Example:

```bash
codex exec -C {codex_worktree} -o {codex_dir}/last-message.txt \
  "$(cat {codex_dir}/codex-review-export.md)"
```

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
~/src/review-council/node_modules/.bin/tsx \
  ~/src/review-council/scripts/orchestrate-review-council.ts \
  --target "branch main..feature/review-council" \
  --run-dir "$PWD/docs/reviews/20260307-183000-review-council" \
  --codex-worktree .worktrees/review-council-codex \
  --claude-command 'claude -p --worktree review-council-claude "$(cat {claude_dir}/claude-review-export.md)"' \
  --codex-command 'codex exec -C {codex_worktree} -o {codex_dir}/last-message.txt "$(cat {codex_dir}/codex-review-export.md)"' \
  --judge-command 'claude -p "$(cat {judge_dir}/judge.md)"'
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

This is a best-effort safety net. Prefer explicit non-interactive mode (`claude -p`, `codex exec`) when possible.

### Schema Validation

After each successful stage, the orchestrator validates the output artifact (`findings.json` for reviewers, `verdict.json` for the judge) against its JSON schema. On validation failure, `success` is set to `false` and `validation_errors` are written to `status.json`.

### Partial Judge Execution

The judge runs if at least one reviewer succeeded. The final JSON summary includes a `reviewers_partial` flag and per-reviewer result details.

## Sentinel Contract

The orchestrator waits for:

- reviewer exit code `0`
- reviewer `done.json`
- judge exit code `0`
- judge `done.json`

If a process exits `0` but omits `done.json`, the stage is treated as incomplete.

## TypeScript Runtime

The scaffold assumes a small standalone TypeScript repo:

```bash
pnpm install
pnpm typecheck
```

Package scripts are defined in `package.json`:

- `pnpm review-council:orchestrate`
- `pnpm review-council:render`
- `pnpm typecheck`

Those scripts are mainly for working inside the standalone skill repo itself. For reviewing another project, prefer the direct local `tsx` binary invocation above so output paths stay relative to the project under review.
