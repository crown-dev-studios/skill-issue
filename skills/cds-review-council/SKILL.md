---
name: cds-review-council
description: "Orchestrate model-parallel code review with selected skill references. Runs a Claude reviewer subagent and a Codex CLI reviewer in parallel with those skill references listed in reviewer prompts as additional review lenses, then synthesizes all findings through a judge agent with semantic deduplication, contradiction detection, and dependency ordering."
argument-hint: "[staged|branch main..HEAD|pr 123|commit abc123]"
disable-model-invocation: true
---

# Review Council

## Purpose

`/review-council` orchestrates multi-source code review:

- **Model reviewers** (Claude + Codex) provide general-purpose parallel review
- **Selected review skills** (cds-architecture-review, cds-testing-philosophy, cds-plan-compliance) are listed in each model reviewer's prompt for that run
- **Judge** synthesizes all findings with semantic dedup, contradiction detection, and dependency ordering

All reviewers run in parallel. The judge adjudicates the combined results.

The harness owns process lifecycle: the Claude reviewer and the judge run as subagents, and the Codex reviewer runs as a background `codex exec` process. There is no orchestrator binary.

## Prerequisites

- A Git working tree to review
- `codex` on `PATH` for the Codex reviewer (optional — that reviewer is skipped when absent)
- Skill directories available for skill references (e.g., `~/.agents/skills/cds-architecture-review`)

## Workflow

### Step 1: Scope Detection

Normalize the argument into one of these forms:

- `staged changes` — review staged (cached) changes
- `branch main..feature-branch` — review branch diff
- `pr 123` — review a pull request
- `commit abc123` — review a specific commit

Generate the diff for analysis:
- Staged: `git diff --cached`
- Branch: `git diff main..HEAD`
- PR: `gh pr diff 123`
- Commit: `git show abc123`

### Step 2: Intent Discovery

Analyze the diff to understand what changed and guide reviewer selection:

1. **Categorize changed files:** source code, tests, config, docs, migrations, schemas.
2. **Identify modules/services touched:** which packages, directories, or service boundaries are affected.
3. **Classify change nature:** new feature, bug fix, refactor, test addition, config change.
4. **Gather stated intent:**
   - PR mode: read the PR description and linked issues.
   - Branch mode: read commit messages.
5. **Check for a plan:** look in `docs/plans/active/` and `docs/plans/` for a plan that references the changed files.

Output a brief intent summary that will be included in all reviewer prompts.

### Step 3: Select Review Skills

Based on intent discovery, select which review skills to include:

| Signal | Skill |
|--------|-------|
| Service boundary, data model, or migration files changed | `cds-architecture-review` |
| Test files or test-adjacent source code changed | `cds-testing-philosophy` |
| Plan exists in `docs/plans/` or ticket has a linked plan | `cds-plan-compliance` |

If the diff is trivial (<20 lines, single file, obvious fix), skip additional review skills.

### Step 4: Prepare the Run

1. Create the run directory `docs/reviews/<run-id>/` with a subdirectory per stage that will run (`claude/`, `codex/`, `judge/`). Use `<UTC yyyymmdd-HHMMSS>-<4 hex chars>` as the run ID.
2. Render one reviewer prompt per model reviewer from [reviewer-export.md](templates/reviewer-export.md) and save it as `<run-dir>/<reviewer>/prompt.md`. Fill every placeholder:
   - `{{REVIEWER_NAME}}` / `{{REVIEWER_NAME_LOWER}}` — `Claude`/`claude` or `Codex`/`codex`
   - `{{TARGET}}` — the normalized target from Step 1 followed by the intent summary from Step 2
   - `{{ARTIFACT_DIR}}` — absolute path to `<run-dir>/<reviewer>/`
   - `{{SCHEMA_PATH}}` — absolute path to [review-findings.schema.json](schemas/review-findings.schema.json)
   - `{{SKILL_REFERENCES}}` — a `## Selected Review Skills` section listing each selected skill name and directory path, with an instruction to apply them as additional review lenses; or a note that no additional review skills were selected

### Step 5: Run Reviewers in Parallel

Launch all reviewers concurrently — do not run them one after another, and do not review the code in the parent context:

- **Claude reviewer:** launch a subagent whose prompt is the rendered `claude/prompt.md`, with a note that the working directory is the project under review.
- **Codex reviewer** (only if `codex` is on `PATH`): run in the background:

  ```bash
  codex exec --json --dangerously-bypass-approvals-and-sandbox \
    "$(cat "<run-dir>/codex/prompt.md")" \
    > "<run-dir>/codex/stream.jsonl" 2> "<run-dir>/codex/stderr.log"
  ```

  If `codex` is not installed, skip this reviewer and say so in the final summary.

Wait for every launched reviewer to finish, polling for each reviewer's `done.json` roughly every 30 seconds rather than blocking indefinitely. If a reviewer has produced no artifacts and no new stream/log output for ~15 minutes, treat it as failed and stop waiting for it — do not kill the process (leave it to finish or die on its own) and do not retry. A reviewer **succeeded** when its `done.json` exists and its `findings.json` parses as JSON with a `findings` array. A reviewer that finished without valid artifacts **failed** — do not retry it; proceed with the reviewers that succeeded and record the failure in the final summary. If every reviewer failed, stop and report that instead of running the judge.

### Step 6: Judge

Render [judge.md](templates/judge.md) with `{{RUN_DIR}}`, `{{TARGET}}`, `{{ARTIFACT_DIR}}` (absolute path to `<run-dir>/judge/`), and `{{SCHEMA_PATH}}` (absolute path to [judge-verdict.schema.json](schemas/judge-verdict.schema.json)). Save it as `<run-dir>/judge/prompt.md` and launch a fresh subagent with that prompt. The judge adjudicates whatever reviewer artifacts are present.

The judge performs:
- **Semantic deduplication** — merges equivalent findings across Claude and Codex
- **Contradiction detection** — flags disagreements between reviewers
- **Dependency ordering** — orders findings so foundational issues come first
- **Confidence from corroboration** — findings flagged by both reviewers carry higher confidence

After the judge completes, derive `<run-dir>/follow-ups.md` from `verdict.json` (`todo_recommendations` in `dependency_order` order).

### Step 7: Present Findings

Present findings to the user in this order:
1. **Contradictions** — need human resolution
2. **Confirmed P1 findings** — in dependency order
3. **Confirmed P2 findings** — in dependency order
4. **Contested findings** — plausible but unverified
5. **Summary of rejected/low-confidence findings** — counts only

If the user asks for a shareable single-file HTML report, use the `cds-veneer` skill on `judge/summary.md` and `judge/verdict.json`.

## Output

All artifacts are written to `docs/reviews/<run-id>/`:

```
docs/reviews/<run-id>/
  follow-ups.md                  # Human-readable next-step list from the judge verdict
  claude/                        # Claude model reviewer
    prompt.md, report.md, findings.json, done.json
  codex/                         # Codex model reviewer
    prompt.md, stream.jsonl, stderr.log, report.md, findings.json, done.json
  judge/                         # Judge adjudication
    prompt.md, summary.md, verdict.json, done.json
```

Add `docs/reviews/` to `.gitignore` to keep review artifacts out of version control.

## Constraints

- The parent agent is the orchestrator. It should not do the review itself, and it presents the judge's verdict rather than re-adjudicating findings.
- Do not create files in `todos/` — the judge recommends todos and Review Council derives `follow-ups.md`, but neither creates authoritative todo files.
- Skills are passed to each model reviewer as additional review lenses for the run (name + path), not inlined prompt bodies.
- Reviewer and judge success is determined by file artifacts (`done.json` plus valid structured output), never by chat or stdout content.

## Supporting Files

- Output contract: [output-contract.md](references/output-contract.md)
- Review findings schema: [review-findings.schema.json](schemas/review-findings.schema.json)
- Judge verdict schema: [judge-verdict.schema.json](schemas/judge-verdict.schema.json)
- Model reviewer template: [reviewer-export.md](templates/reviewer-export.md)
- Judge template: [judge.md](templates/judge.md)
