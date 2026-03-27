---
name: review-council
description: Orchestrate model-parallel code review with selected skill references. Runs Claude and Codex in parallel with those skill references listed in reviewer prompts as additional review lenses, then synthesizes all findings through an LLM judge with semantic deduplication, contradiction detection, and dependency ordering.
argument-hint: [staged|branch main..HEAD|pr 123|commit abc123]
disable-model-invocation: true
---

# Review Council

## Purpose

`/review-council` orchestrates multi-source code review:

- **Model reviewers** (Claude + Codex) provide general-purpose parallel review via CLI processes
- **Selected review skills** (architecture-review, testing-philosophy, plan-compliance) are listed in each model reviewer's prompt for that run
- **Judge** synthesizes all findings with semantic dedup, contradiction detection, and dependency ordering

All reviewers run in parallel. The judge adjudicates the combined results. A static HTML report is rendered for human review.

## Prerequisites

- Node.js and pnpm (for the TS orchestrator)
- `claude` and/or `codex` on `PATH` for model reviewers
- A Git working tree to review
- Skill directories available for `--skill-paths` (e.g., `~/.agents/skills/architecture-review`)

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
| Service boundary, data model, or migration files changed | `architecture-review` |
| Test files or test-adjacent source code changed | `testing-philosophy` |
| Plan exists in `docs/plans/` or ticket has a linked plan | `plan-compliance` |

If the diff is trivial (<20 lines, single file, obvious fix), skip additional review skills.

### Step 4: Run Review

Run the orchestrator with `--skill-paths` pointing at the selected skill directories:

```bash
npx @crown-dev-studios/review-council \
  --target "<target>" \
  --skill-paths "/path/to/architecture-review,/path/to/plan-compliance" \
  --open-html
```

This single invocation:
1. Lists the selected review skills in both Claude and Codex reviewer prompts
2. Runs Claude + Codex in parallel — each applies the selected skills independently
3. Runs the judge to merge, deduplicate, and resolve contradictions across both outputs
4. Renders the HTML report

Use `--no-claude` or `--no-codex` to skip one model reviewer.

The judge performs:
- **Semantic deduplication** — merges equivalent findings across Claude and Codex
- **Contradiction detection** — flags disagreements between reviewers
- **Dependency ordering** — orders findings so foundational issues come first
- **Confidence from corroboration** — findings flagged by both reviewers carry higher confidence

### Step 5: Present Findings

Present findings to the user in this order:
1. **Contradictions** — need human resolution
2. **Confirmed P1 findings** — in dependency order
3. **Confirmed P2 findings** — in dependency order
4. **Contested findings** — plausible but unverified
5. **Summary of rejected/low-confidence findings** — counts only

## Mode Parameter

The skill supports a mode argument (design for all, only interactive is implemented):

- **Default (interactive):** present findings, user responds
- **`mode:autofix`** (future): apply safe fixes automatically
- **`mode:report-only`** (future): generate artifacts without interaction

## Output

All artifacts are written to `docs/reviews/<run-id>/`:

```
docs/reviews/<run-id>/
  run.json                       # Run metadata
  bundle.json                    # Consolidated data for HTML
  follow-ups.md                  # Human-readable next-step list from the judge verdict
  index.html                     # Static review report
  claude/                        # Claude model reviewer
    report.md, findings.json, done.json, status.json
  codex/                         # Codex model reviewer
    report.md, findings.json, done.json, status.json
  judge/                         # Judge adjudication
    summary.md, verdict.json, done.json, status.json
```

Add `docs/reviews/` to `.gitignore` to keep review artifacts out of version control.

## Constraints

- The parent agent is the orchestrator. It should not do the review itself.
- Do not create files in `todos/` — the judge recommends todos and Review Council derives `follow-ups.md`, but neither creates authoritative todo files.
- Skills are passed to each model reviewer as additional review lenses for the run, not inlined prompt bodies.
- Model reviewers (Claude, Codex) run as CLI processes via the TS orchestrator.
- Interactive prompts from reviewer CLIs are detected and relayed; prefer explicit non-interactive mode (`claude --dangerously-skip-permissions -p`, `codex exec --full-auto`) for reliability.

## Supporting Files

- Output contract: [output-contract.md](references/output-contract.md)
- CLI examples: [cli-integration.md](references/cli-integration.md)
- Review findings schema: [review-findings.schema.json](schemas/review-findings.schema.json)
- Judge verdict schema: [judge-verdict.schema.json](schemas/judge-verdict.schema.json)
- Model reviewer template: [reviewer-export.md](templates/reviewer-export.md)
- Judge template: [judge.md](templates/judge.md)
- HTML template: [report.html](templates/report.html)
