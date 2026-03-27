# CLI Integration

The orchestrator script accepts literal CLI commands with placeholders.

Best practice: point reviewer CLIs at the rendered prompt files created inside the run directory. This keeps the command templates self-contained and avoids depending on any external `/review-export` command.

Available environment variables in commands:

- `$CWD`
- `$SKILL_DIR`
- `$RUN_ID`
- `$RUN_DIR`
- `$CLAUDE_DIR`
- `$CODEX_DIR`
- `$JUDGE_DIR`
- `$REVIEW_SCHEMA`
- `$JUDGE_SCHEMA`

The orchestrator renders these prompt files before launching any stage:

- `{claude_dir}/claude-review-export.md`
- `{codex_dir}/codex-review-export.md`
- `{judge_dir}/judge.md`

When invoking from the project being reviewed, run `npx @crown-dev-studios/review-council` so `process.cwd()` stays anchored to the project and output lands in `docs/reviews/`.

## Default Commands

The orchestrator provides sensible defaults for Claude, Codex, and the judge. No command flags are needed for the common case:

```bash
npx @crown-dev-studios/review-council --target "staged changes" --open-html
```

Built-in defaults:
- **Claude:** `claude --dangerously-skip-permissions -p "$(cat $CLAUDE_DIR/claude-review-export.md)"`
- **Codex:** `codex exec --full-auto "$(cat $CODEX_DIR/codex-review-export.md)"`
- **Judge:** `codex exec --full-auto "$(cat $JUDGE_DIR/judge.md)"`

Use `--claude-command`, `--codex-command`, or `--judge-command` to override any default.

Use `--no-claude` or `--no-codex` to skip a model reviewer entirely.

## Examples

Review staged changes with defaults (Claude + Codex + Codex judge):

```bash
npx @crown-dev-studios/review-council --target "staged changes" --open-html
```

Review a branch with only Claude:

```bash
npx @crown-dev-studios/review-council \
  --target "branch main..feature/workspace-manager" \
  --no-codex \
  --open-html
```

Review a PR:

```bash
npx @crown-dev-studios/review-council --target "pr 42" --open-html
```

Review with selected skills:

```bash
npx @crown-dev-studios/review-council \
  --target "branch main..HEAD" \
  --skill-paths "/path/to/architecture-review,/path/to/plan-compliance" \
  --open-html
```

## Selected Review Skills

`--skill-paths <paths>` is a comma-separated list of paths to skill directories. The orchestrator passes those selected skills into both Claude and Codex reviewer prompts as additional review lenses for the run. Each model applies all selected skills independently.

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

This is a best-effort safety net. Prefer explicit non-interactive mode (`claude --dangerously-skip-permissions -p`, `codex exec --full-auto`) when possible.

### Partial Judge Execution

The judge runs if at least one reviewer succeeded. The final JSON summary includes a `reviewers_partial` flag and per-reviewer result details.

## Sentinel Contract

The orchestrator waits for:

- reviewer exit code `0`
- reviewer `done.json`
- judge exit code `0`
- judge `done.json`

If a process exits `0` but omits `done.json`, the stage is treated as incomplete.

