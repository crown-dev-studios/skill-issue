---
name: review-triage
description: Classify and route review feedback before implementation begins. Use when review findings exist from any source and need validation, prioritization, and routing to the right next action.
---

# Review Triage

## Purpose

Classify review feedback before implementation begins. Validate findings, decide what to address, dismiss, or defer, and route each finding to the right next action based on severity and size.

## When To Use

- Review feedback exists from any source (plan-review, architecture-review, review-council, PR comments, manual review).
- The feedback needs validation before committing to implementation work.

## When Not To Use

- No review has been run. Run the appropriate review skill first.
- The feedback is a single obvious fix. Just do it.

## Core Principles

1. **Validate before accepting.** Review feedback is not automatically correct. Each finding must be evaluated for accuracy, relevance, and priority before creating work.
2. **Classify and route, don't just label.** Triage determines the next action, not just a category. Small fixes get done immediately. Medium issues become tickets. Large concerns become plans.
3. **Traceability is mandatory.** Every follow-up must reference the original work that produced it. No orphaned tickets.
4. **Protect against churn.** Do not accept findings that create significant implementation work without proportional value. Dismiss findings that are speculative, low-confidence, or address hypothetical problems.
5. **Severity drives urgency, size drives routing.** P1 findings are always addressed. P2 findings are addressed or tracked. P3 findings are addressed only if small, otherwise dismissed or deferred.

## Severity Scale

- **P1 (critical).** Must be addressed. Correctness, security, or data integrity risk.
- **P2 (important).** Should be addressed. Maintainability, performance, or architecture concern.
- **P3 (nice-to-have).** Could be addressed. Improvement or cleanup that adds marginal value.

## Routing Matrix

| | Small | Medium | Large |
|---|---|---|---|
| **P1** | Fix immediately | Follow-up ticket, high priority | Follow-up plan |
| **P2** | Fix immediately | Follow-up ticket | Follow-up plan |
| **P3** | Fix immediately or dismiss | Follow-up ticket if valuable | Dismiss or defer |

## Workflow

1. **Gather findings.** Accept review output from any source — plan-review, architecture-review, review-council, PR comments, or manual review.
2. **Present findings one at a time.** Show the finding with its source, evidence, and recommended action.
3. **Classify each finding.** Assign severity (P1/P2/P3) and validate — is this finding accurate, relevant, and worth acting on?
4. **Route each finding.** Based on severity and size:
   - **Fix now** — apply the fix immediately.
   - **Follow-up ticket** — create a Linear issue with source reference.
   - **Follow-up plan** — create a plan stub in `docs/plans/active/` with source frontmatter, routed through the planning skill.
   - **Dismiss** — state the reason and move on.
5. **Summarize triage results.** Communicate the triage summary in the prescribed format.

## Follow-Up Plan Frontmatter

When triage creates a follow-up plan, include source traceability:

```markdown
---
title: <plan title>
date: YYYY-MM-DD
status: proposed
source: <path to the original plan, PR, or review that produced this finding>
source_finding: <severity — brief description of the finding>
---
```

## Triage Summary Format

```markdown
## Triage Summary

| # | Finding | Severity | Why It Matters | Decision | Status |
|---|---|---|---|---|---|
| 1 | <title> | P1 | <why it matters> | Fix now | Fixed |
| 2 | <title> | P2 | <why it matters> | Follow-up plan | Plan stub created: <path> |
| 3 | <title> | P3 | <why it matters> | Dismiss | <reason> |
```

## Constraints On This Skill

- Findings are presented one at a time. Confirm classification and routing before moving to the next.
- Dismissed findings are communicated during the session, not persisted.
- Small fixes can be applied immediately during triage.
- Agent-agnostic. No tool-specific or platform-specific references.
