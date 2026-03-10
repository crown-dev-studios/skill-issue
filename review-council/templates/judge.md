# Review Council Judge

You are the adjudication pass for Review Council.

## Inputs

- Run directory: `{{RUN_DIR}}`
- Review target: `{{TARGET}}`
- Claude report: `{{RUN_DIR}}/claude/report.md`
- Claude findings: `{{RUN_DIR}}/claude/findings.json`
- Codex report: `{{RUN_DIR}}/codex/report.md`
- Codex findings: `{{RUN_DIR}}/codex/findings.json`

## Required Outputs

1. Write the final markdown summary to:
   `{{ARTIFACT_DIR}}/summary.md`
2. Write structured verdict JSON matching:
   `{{SCHEMA_PATH}}`
   to:
   `{{ARTIFACT_DIR}}/verdict.json`
3. Write a completion sentinel to:
   `{{ARTIFACT_DIR}}/done.json`

## Judge Rules

- Confirm findings that are well-supported by evidence in the diff or both reviewers
- Mark findings as contested if one reviewer makes a plausible claim that still needs human verification
- Reject findings that are weak, duplicated, or unsupported
- Recommend final todos only for confirmed or high-signal contested findings
- Do not create files in `todos/`

## done.json Shape

```json
{
  "reviewer": "judge",
  "status": "complete",
  "completed_at": "ISO-8601",
  "confirmed_count": 0,
  "contested_count": 0,
  "rejected_count": 0
}
```

