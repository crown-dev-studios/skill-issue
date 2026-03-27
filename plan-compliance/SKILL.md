---

## name: plan-compliance
description: Check whether an implementation matches its plan of record. Use when a plan exists and code has been written against it. Flags deviations, missing phases, unimplemented acceptance criteria, and scope drift.
argument-hint: [path/to/plan.md|auto]

# Plan Compliance Review

## Purpose

Verify that an implementation matches its plan of record. Flag deviations, missing phases, unimplemented acceptance criteria, and scope drift.

This skill is used as a review lens inside Review Council and can also be invoked standalone.

## Plan Source Detection

Locate the plan of record using this priority order:

1. **Explicit argument:** If a path is provided as the argument, use that file directly.
2. **CLI mode:** Search `docs/plans/active/` then `docs/plans/` for plan files. Match plans to the changed files by:
  - File references in the plan body that overlap with the diff's changed files.
  - Title keywords that match the branch name or commit message subjects.
  - Most recently modified plan when multiple candidates match.
3. **PR mode:** Extract plan references from:
  - PR description body (links or file paths mentioning plans).
  - Linked issues and their descriptions.
  - Fall back to `docs/plans/`.

If no plan is found after exhausting all sources, report a single finding:

- Title: "No plan of record found for this change"
- Severity: p3
- Confidence: low
- Category: plan-compliance
- Recommended fix: "Create a plan in docs/plans/ or link an existing plan in the PR description."

## Review Lenses

Once the plan is located, review the implementation against these lenses:

### Phase Completeness

- Are all phases defined in the plan implemented?
- Are any phases skipped or only partially completed?
- If the plan defines an implementation sequence, is the sequence respected?

### Acceptance Criteria

- Are all acceptance criteria from the plan met in the implementation?
- For each criterion, identify the specific code, test, or artifact that satisfies it.
- Flag any acceptance criteria with no corresponding implementation evidence.

### Scope Compliance

- Does the implementation stay within the plan's defined scope?
- Flag **missing items**: things the plan describes that are not implemented.
- Flag **scope creep**: things implemented that the plan does not describe. Not all scope creep is negative — distinguish intentional extensions from drift.

### Architecture Alignment

- Does the implementation follow the architecture direction stated in the plan?
- If the plan specifies API boundaries, module structure, or data model choices, verify the implementation honors them.
- Defer deep architecture analysis to the architecture-review skill — focus here on what the plan explicitly states.

### Verification Coverage

- Does the implementation include the verification evidence the plan requires?
- If the plan defines specific test scenarios, validation commands, or proof strategies, verify they are present.
- Flag verification gaps where the plan requires proof but the implementation provides none.

## Output

Present findings as a markdown checklist with severity and confidence for each item:

- Missing acceptance criteria: p1 high
- Skipped phases: p1 or p2 depending on impact
- Scope creep without justification: p2 medium
- Missing verification: p2 medium
- No plan found: p3 low