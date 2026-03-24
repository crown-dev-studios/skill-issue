# Output Contract

`review-council` groups run attempts by review session:

```text
docs/reviews/<review-id>/
  latest-run.json
  runs/
    <run-id>/
      run.json
      bundle.json
      index.html
      claude/
        report.md
        findings.json
        done.json
        status.json
        stdout.log
        stderr.log
      codex/
        report.md
        findings.json
        done.json
        status.json
        stdout.log
        stderr.log
      judge/
        summary.md
        verdict.json
        done.json
        status.json
        stdout.log
        stderr.log
```

## Reviewer Output

Each reviewer writes:

- `report.md`: human-readable review
- `findings.json`: structured findings matching `schemas/review-findings.schema.json`
- `done.json`: sentinel file confirming the agent finished writing artifacts

`done.json` shape:

```json
{
  "review_id": "staged-changes-review",
  "run_id": "20260318-143000123-abc12345",
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

## Stage Status

The orchestrator writes `status.json` per stage with these fields:

```json
{
  "review_id": "staged-changes-review",
  "run_id": "20260318-143000123-abc12345",
  "stage": "claude",
  "command": "claude -p ...",
  "started_at": "2026-03-07T18:25:00Z",
  "finished_at": "2026-03-07T18:30:00Z",
  "exit_code": 0,
  "require_sentinel": true,
  "done_file_present": true,
  "required_artifacts": ["report.md", "findings.json", "done.json"],
  "artifact_presence": { "report.md": true, "findings.json": true, "done.json": true },
  "missing_artifacts": [],
  "success": true,
  "failure_reason": null,
  "timed_out": false,
  "attempts": 1,
  "retried": false,
  "stdout_log": "/path/to/stdout.log",
  "stderr_log": "/path/to/stderr.log"
}
```

On validation failure or missing artifacts, `status.json` additionally contains:

```json
{
  "success": false,
  "failure_reason": "schema_validation_failed",
  "validation_errors": [
    { "path": "findings[0].severity", "message": "value \"critical\" not in enum [\"p1\", \"p2\", \"p3\"]" }
  ]
}
```

Key fields:

| Field | Type | Description |
|---|---|---|
| `exit_code` | number | Process exit code. `124` on timeout. |
| `timed_out` | boolean | Whether the stage was killed due to timeout. |
| `attempts` | number | Total attempts (1 = no retries). |
| `retried` | boolean | Whether the stage was retried at least once. |
| `missing_artifacts` | array | Required artifacts still missing after the final attempt. |
| `failure_reason` | string? | `process_failed`, `timeout`, `missing_artifacts`, or `schema_validation_failed`. |
| `validation_errors` | array? | Schema validation errors if the output JSON was malformed. |

## Bundle Output

The HTML renderer writes:

- `bundle.json`: packages statuses, raw findings, raw reports, judge output, and artifact status into a single file
- `index.html`: static page for side-by-side reading

`bundle.json` shape:

```json
{
  "review_id": "staged-changes-review",
  "run_id": "20260318-143000123-abc12345",
  "review_target": "staged changes",
  "run": { "review_id": "...", "run_id": "...", "review_target": "...", "created_at": "..." },
  "candidate_findings": [ { "reviewer": "claude", "severity": "p1", "title": "...", "confidence": "high", "files": [] } ],
  "judge_verdict": { "overall_verdict": "needs-fixes", "..." : "..." },
  "status": {
    "claude": { "success": true, "..." : "..." },
    "codex": { "success": true, "..." : "..." },
    "judge": { "success": true, "..." : "..." }
  },
  "reports": {
    "claude": "markdown...",
    "codex": "markdown...",
    "judge": "markdown..."
  },
  "artifact_status": {
    "claude": "ok",
    "codex": "ok",
    "judge": "ok"
  }
}
```

`artifact_status` values: `"ok"` (valid JSON loaded), `"missing"` (file not found), `"malformed"` (file exists but is not valid JSON).

## Ownership Rules

- Reviewer outputs are candidate findings, not authoritative todos
- The judge owns the final verdict
- Todo creation should be a follow-up step from `verdict.json`, not from raw reviewer output
