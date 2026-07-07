# Output Contract

Review Council writes one run directory per review session:

```text
docs/reviews/<run-id>/
  follow-ups.md
  claude/
    prompt.md
    report.md
    findings.json
    done.json
  codex/
    prompt.md
    stream.jsonl
    stderr.log
    report.md
    findings.json
    done.json
  judge/
    prompt.md
    summary.md
    verdict.json
    done.json
```

A stage directory exists only when that stage ran. `stream.jsonl` and `stderr.log` are captured process output for the Codex CLI reviewer and are diagnostic only.

Add `docs/reviews/` to `.gitignore` to keep review artifacts out of version control.

## Reviewer Output

Each model reviewer (Claude, Codex) writes:

- `report.md`: human-readable review
- `findings.json`: structured findings matching `schemas/review-findings.schema.json`
- `done.json`: sentinel file confirming the reviewer finished writing artifacts

A reviewer stage succeeded when `done.json` exists and `findings.json` parses as JSON with a `findings` array. Anything a reviewer prints to chat or stdout is diagnostic only.

`done.json` shape:

```json
{
  "reviewer": "claude",
  "status": "complete",
  "completed_at": "2026-03-07T18:30:00Z",
  "finding_count": 4
}
```

## Judge Output

The judge writes:

- `summary.md`: final markdown summary for humans
- `verdict.json`: adjudicated findings matching `schemas/judge-verdict.schema.json`
- `done.json`: sentinel confirming the judge finished

The orchestrating agent derives `follow-ups.md` at the run root from `verdict.json.todo_recommendations` and `verdict.json.dependency_order`. This is the human-readable next-step list for the run.

## Failure Handling

- A reviewer that finishes without valid artifacts is recorded as failed in the final summary; it is not retried.
- The judge runs when at least one reviewer succeeded and adjudicates only the artifacts present.
- If every reviewer failed, the run stops before the judge and reports the failures.

## Ownership Rules

- Reviewer outputs are candidate findings, not authoritative todos
- The judge owns the final verdict
- `follow-ups.md` is derived from `verdict.json` for humans, but `verdict.json` remains the authoritative structured source
- Todo creation should be a follow-up step from `verdict.json`, not from raw reviewer output
