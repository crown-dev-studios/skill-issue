# CLI Integration

The orchestrator uses canonical built-in stage commands and execution metadata. Callers can choose which stages run and which prompt templates render, but command choice and sentinel enforcement are no longer user-overridable API surfaces.

Available environment variables in built-in commands:

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

## Built-In Commands

The orchestrator provides canonical stage commands for Claude, Codex, and the judge. No command flags are needed for the common case:

```bash
npx @crown-dev-studios/review-council --target "staged changes" --open-html
```

Built-in defaults:
- **Claude:** `claude --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p "$(cat "$CLAUDE_DIR/claude-review-export.md")"`
- **Codex:** `codex exec --json --dangerously-bypass-approvals-and-sandbox "$(cat $CODEX_DIR/codex-review-export.md)"`
- **Judge:** `codex exec --json --dangerously-bypass-approvals-and-sandbox "$(cat $JUDGE_DIR/judge.md)"`

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

`--retries <n>` (default: 2) retries a stage up to N times on non-zero exit. Delay between retries uses exponential backoff: `2000 * 2^(attempt-1)` ms (2s, 4s, 8s...). The final `status.json` records the final `attempts` count.

Retries are skipped for timeouts (not transient).

### JSONL Streams

All built-in stages emit JSONL events on stdout:

- Claude via `--output-format stream-json`
- Codex reviewer via `codex exec --json`
- Codex judge via `codex exec --json`

The orchestrator records that stdout directly to `stream.jsonl` for each stage and derives `last_activity_at`, `last_event_type`, `stream_event_count`, and `stream_parse_errors` from that one stream.

### Partial Judge Execution

The judge runs if at least one reviewer succeeded. The final JSON summary includes a `reviewers_partial` flag and per-reviewer result details.

## Sentinel Contract

The orchestrator waits for:

- reviewer exit code `0`
- reviewer `done.json`
- judge exit code `0`
- judge `done.json`

If a process exits `0` but omits `done.json`, the stage is treated as incomplete. There is no sentinel bypass mode.
