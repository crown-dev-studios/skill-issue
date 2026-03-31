# Output Contract

`review-council` writes one run directory per review session:

```text
docs/reviews/<run-id>/
  run.json
  bundle.json
  follow-ups.md
  index.html
  claude/
    report.md
    findings.json
    done.json
    status.json
    stream.jsonl
    stderr.log
  codex/
    report.md
    findings.json
    done.json
    status.json
    stream.jsonl
    stderr.log
  judge/
    summary.md
    verdict.json
    done.json
    status.json
    stream.jsonl
    stderr.log
```

Add `docs/reviews/` to `.gitignore` to keep review artifacts out of version control.

## Reviewer Output

Each model reviewer (Claude, Codex) writes:

- `report.md`: human-readable review
- `findings.json`: structured findings matching `schemas/review-findings.schema.json`
- `done.json`: sentinel file confirming the agent finished writing artifacts
- `stream.jsonl`: raw JSONL stdout event stream for the stage

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

`review-council` also derives `follow-ups.md` at the run root from `verdict.json.todo_recommendations` and `verdict.json.dependency_order`. This is the human-readable next-step list for the run.

## Stage Status

The orchestrator writes `status.json` per stage with these fields:

```json
{
  "stage": "claude",
  "command_id": "claude-review",
  "command": "claude --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages -p ...",
  "started_at": "2026-03-07T18:25:00Z",
  "finished_at": "2026-03-07T18:30:00Z",
  "exit_code": 0,
  "success": true,
  "timed_out": false,
  "attempts": 1,
  "stream_log": "/path/to/stream.jsonl",
  "stderr_log": "/path/to/stderr.log",
  "last_activity_at": "2026-03-07T18:29:59Z",
  "last_event_type": "stop",
  "stream_event_count": 42,
  "stream_parse_errors": 0,
  "artifact_presence": {
    "report.md": true,
    "findings.json": true,
    "done.json": true
  },
  "missing_artifacts": [],
  "validation_errors": []
}
```

On validation failure, `status.json` additionally contains:

```json
{
  "success": false,
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
| `stream_log` | string | JSONL stdout event stream for the stage. |
| `last_activity_at` | string? | Last observed stream activity timestamp. |
| `last_event_type` | string? | Last observed stream event type. |
| `stream_event_count` | number | Parsed stdout event count for the attempt. |
| `stream_parse_errors` | number | Number of stdout lines that failed JSON parsing. |
| `missing_artifacts` | array | Required artifacts absent for the final attempt. |
| `validation_errors` | array | Lightweight output validation errors for malformed structured artifacts. |
| `warnings` | array? | Non-authoritative observability warnings, such as stream parse issues. |

## Run Metadata

`run.json` records the rendered prompt sources plus canonical execution metadata for each executable stage:

```json
{
  "run_id": "20260330-12345678",
  "review_target": "staged changes",
  "stage_executions": {
    "claude": {
      "command_id": "claude-review",
      "artifacts": {
        "stream_log": "/path/to/stream.jsonl"
      }
    },
    "codex": {
      "command_id": "codex-review",
      "artifacts": {
        "stream_log": "/path/to/stream.jsonl"
      }
    },
    "judge": {
      "command_id": "codex-judge",
      "artifacts": {
        "stream_log": "/path/to/stream.jsonl"
      }
    }
  }
}
```

## Bundle Output

The HTML renderer writes:

- `bundle.json`: packages statuses, raw findings, raw reports, judge output, and artifact status into a single file
- `follow-ups.md`: human-readable follow-up list derived from the judge verdict
- `index.html`: static page for side-by-side reading

`bundle.json` shape:

```json
{
  "run": { "target": "...", "created_at": "..." },
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
- `follow-ups.md` is derived from `verdict.json` for humans, but `verdict.json` remains the authoritative structured source
- Todo creation should be a follow-up step from `verdict.json`, not from raw reviewer output
