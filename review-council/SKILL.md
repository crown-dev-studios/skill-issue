---
name: review-council
description: Orchestrate Claude, Codex, or other local CLI reviewers against the same target, wait for their exported findings, run a judge pass, and generate a static HTML plus markdown review bundle. Use when you want side-by-side raw reviews before creating final todos.
argument-hint: [staged|branch main..HEAD|pr 123|commit abc123]
disable-model-invocation: true
---

# Review Council

## Purpose

`/review-council` is the manual entrypoint for multi-agent code review orchestration.

This directory is intended to be both a standalone skill repo and the source for the published npm package. The prompt templates, schemas, renderer, and orchestrator all live here.

It is intentionally separate from `workflows-review`:

- `workflows-review` is optimized for single-agent review and immediate todo creation
- `review-council` is optimized for parallel raw review, adjudication, and artifact rendering

Use this when you want:

- a Claude review and a Codex review on the same target
- isolated worktrees or isolated CLI runs per reviewer
- raw reviewer artifacts stored outside `todos/`
- a judge step that decides which findings are valid
- a static HTML page next to the final markdown judge summary

## Prerequisites

- Node.js 20+
- `claude` and/or `codex` on `PATH` for the stages you want to run
- A Git working tree to review
- Reviewer CLIs must already be authenticated and able to run non-interactively

## Quick Start

1. Put this directory somewhere stable, for example `~/src/review-council`.

2. Optional: install it as a slash-invocable skill by copying or symlinking this directory to one or both skill locations:

```bash
cp -R ~/src/review-council ~/.claude/skills/review-council
cp -R ~/src/review-council ~/.codex/skills/review-council
```

3. Review or customize the command templates in [cli-integration.md](references/cli-integration.md).

No external `/review-export` command is required. The orchestrator renders self-contained prompt files into each stage directory before launching reviewer CLIs.

4. From the project root you want to review, run the published CLI. By default it writes each run under `docs/reviews/<review-id>/runs/<run-id>/` in the current project:

```bash
npx @crown-dev-studios/review-council \
  --target "staged changes" \
  --review-id staged-changes-review \
  --claude-command 'claude -p --disable-slash-commands --permission-mode acceptEdits "$(cat "$CLAUDE_DIR/claude-review-export.md")" < /dev/null' \
  --codex-command 'codex exec --sandbox workspace-write -o "$CODEX_DIR/last-message.txt" "$(cat "$CODEX_DIR/codex-review-export.md")"' \
  --judge-command 'codex exec --sandbox workspace-write -o "$JUDGE_DIR/last-message.txt" "$(cat "$JUDGE_DIR/judge.md")"' \
  --timeout 300000 \
  --retries 2
```

- `--timeout <ms>`: per-stage timeout (default 300000 — 5 minutes). On timeout the process receives SIGTERM, then SIGKILL after a 5-second grace period.
- `--retries <n>`: max retries per stage on non-timeout failure (default 2). Uses exponential backoff starting at 2 seconds.
- For Claude reviewer runs, use `claude -p --disable-slash-commands --permission-mode acceptEdits ... < /dev/null`. This keeps the run headless, disables skills, allows artifact writes into the stage directory without interactive approval prompts, and avoids stdin wait warnings.
- When using Codex for reviewer or judge stages, include `--sandbox workspace-write` so it can write artifacts into the run directory.
- `--skip-judge` disables judge prompt rendering, judge command validation, and judge execution.
- Pass `--review-id` explicitly when you want the same review to be easy to correlate across reruns.

If the package is already installed globally, `review-council --target ...` is equivalent.

### Development from a Source Checkout

The packaged CLI is the supported runtime. Contributor workflow remains source-first:

```bash
cd ~/src/review-council
pnpm install
pnpm typecheck
pnpm test
pnpm verify:package
```

This produces:

- `docs/reviews/<review-id>/runs/<run-id>/judge/summary.md`
- `docs/reviews/<review-id>/runs/<run-id>/judge/verdict.json`
- `docs/reviews/<review-id>/runs/<run-id>/bundle.json`
- `docs/reviews/<review-id>/runs/<run-id>/index.html`

### Example findings.json

```json
{
  "review_id": "staged-changes-review",
  "run_id": "20260318-143000123-abc12345",
  "reviewer": "claude",
  "target": "staged changes",
  "generated_at": "2026-03-07T18:30:00Z",
  "summary": "Found two issues: one SQL injection and one missing index.",
  "findings": [
    {
      "id": "F001",
      "title": "SQL injection in search endpoint",
      "severity": "p1",
      "confidence": "high",
      "category": "security",
      "description": "Unsanitized user input passed directly to raw SQL query.",
      "evidence": "db.query(`SELECT * FROM users WHERE name = '${input}'`)",
      "recommended_fix": "Use parameterized queries instead of string interpolation.",
      "files": [
        { "path": "src/routes/search.ts", "line": 42 }
      ]
    },
    {
      "id": "F002",
      "title": "Missing index on users.email",
      "severity": "p3",
      "confidence": "medium",
      "category": "performance",
      "description": "The users.email column is queried frequently but has no index.",
      "evidence": "Query plan shows sequential scan on users table.",
      "recommended_fix": "Add a B-tree index on users.email.",
      "files": [
        { "path": "db/migrations/001_create_users.sql" }
      ]
    }
  ]
}
```

### Example verdict.json

```json
{
  "review_id": "staged-changes-review",
  "run_id": "20260318-143000123-abc12345",
  "target": "staged changes",
  "generated_at": "2026-03-07T14:30:00Z",
  "overall_verdict": "needs-fixes",
  "summary_markdown": "Two confirmed issues require attention before merge.",
  "confirmed_findings": [
    {
      "title": "SQL injection in search endpoint",
      "status": "confirmed",
      "reason": "Both reviewers flagged unsanitized user input passed to raw query.",
      "final_priority": "p1",
      "reviewer_ids": ["claude", "codex"]
    }
  ],
  "contested_findings": [
    {
      "title": "Missing index on users.email",
      "status": "contested",
      "reason": "Claude flagged as p2 but Codex noted the table has <1k rows.",
      "final_priority": "p3",
      "reviewer_ids": ["claude"]
    }
  ],
  "rejected_findings": [
    {
      "title": "Unused import in helpers.ts",
      "status": "rejected",
      "reason": "Import is used in a type-only context; no runtime impact."
    }
  ],
  "todo_recommendations": [
    {
      "title": "Parameterize search query to prevent SQL injection",
      "priority": "p1",
      "reason": "Confirmed by both reviewers as a security vulnerability."
    }
  ]
}
```

## Workflow

### Step 1: Choose the Review Target

Normalize the target into one of these forms:

- `staged changes`
- `branch main..feature-branch`
- `pr 123`
- `commit abc123`

### Step 2: Spawn Reviewer CLIs

The parent agent is the orchestrator. It should not do the review itself.

Its job is to:

1. Create a run directory
2. Spawn reviewer CLIs with explicit commands
3. Wait for both reviewers to finish
4. Confirm each reviewer wrote `done.json`
5. Run the judge step
6. Render HTML

Use the environment variables documented in [cli-integration.md](references/cli-integration.md). Prefer the rendered stage prompt files under `$CLAUDE_DIR`, `$CODEX_DIR`, and `$JUDGE_DIR` over the source templates under `templates/`.

### Step 3: Export Raw Reviewer Artifacts

Each reviewer should write only raw artifacts:

- `report.md`
- `findings.json`
- `done.json`

Do not create authoritative todos during raw review.

If you want to reuse the heuristics from `workflows-review`, copy its review bar and agent choices into the reviewer prompts, but stop before todo creation.

### Step 4: Judge the Combined Result

The judge reads both raw reviewer outputs and decides:

- which findings are confirmed
- which findings are contested
- which findings are rejected
- which findings are worth turning into final todos

The judge writes:

- `summary.md`
- `verdict.json`
- `done.json`

### Step 5: Render the Reading View

Render `index.html` after the judge completes.

The HTML page should make these easy to scan:

- judge summary
- candidate findings from each reviewer
- confirmed versus contested verdicts
- raw markdown reports from Claude and Codex

## Important Constraints

- Do not run `workflows-review` twice in the same working tree if it will write directly to `todos/`
- If you must reuse `workflows-review` unchanged, run each reviewer in a separate worktree so each run has its own local `todos/`
- Keep final todo creation as a later, explicit step owned by the judge or a follow-up workflow
- Interactive prompts from reviewer CLIs are detected and relayed to the user one at a time; explicit non-interactive commands such as `claude -p --disable-slash-commands --permission-mode acceptEdits < /dev/null` or `codex exec` remain the standard mode for raw review runs

## Supporting Files

- Output contract: [output-contract.md](references/output-contract.md)
- CLI examples: [cli-integration.md](references/cli-integration.md)
- Review schema: [review-findings.schema.json](schemas/review-findings.schema.json)
- Judge schema: [judge-verdict.schema.json](schemas/judge-verdict.schema.json)
- Reviewer template: [reviewer-export.md](templates/reviewer-export.md)
- Judge template: [judge.md](templates/judge.md)
- HTML template: [report.html](templates/report.html)
- CLI entrypoint: [src/cli.ts](src/cli.ts)
- Orchestrator runtime: [src/orchestrate-review-council.ts](src/orchestrate-review-council.ts)
- Renderer: [src/render-review-html.ts](src/render-review-html.ts)
- TypeScript package: [package.json](package.json)
- TypeScript config: [tsconfig.json](tsconfig.json)
