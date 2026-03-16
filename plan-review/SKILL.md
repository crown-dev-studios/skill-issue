---
name: plan-review
description: Challenge and strengthen a plan or brainstorm before implementation begins. Use when a plan of record or brainstorm document exists and needs a second pass for scope, sequencing, testing, complexity, or operability gaps.
---

# Plan Review

## Purpose

Challenge and strengthen a plan or brainstorm before implementation begins. Review for scope, product framing, implementation sequencing, complexity, testing coverage, and operability — broader than architecture alone.

## When To Use

- A plan of record exists and implementation has not started.
- A brainstorm document exists and needs challenge before moving to planning.
- The plan is nontrivial enough that a second pass could catch scope, sequencing, or verification gaps.

## When Not To Use

- No plan or brainstorm exists yet. Use brainstorming or planning first.
- The review is specifically about model integrity and service boundaries. Use architecture-review.
- Implementation is already complete. Use review-council for code review.

## Core Principles

1. **Understand the direction before challenging it.** Verify the problem framing and architecture direction are sound before questioning scope or details.
2. **Every finding needs a recommendation.** Do not flag problems without stating what to do — tighten, cut, defer, or expand.
3. **Review the plan, not a hypothetical implementation.** Evaluate what the plan says, not what the code might look like.
4. **Findings must be high-confidence.** Do not generate noise. Flag things that actually matter. If a concern is speculative, say so and lower its priority.
5. **Respect settled decisions.** If the plan considered and rejected an approach, do not re-litigate it without new evidence.
6. **Recommend first, explain why.** Lead with the recommended action. Present options when there is a real choice. Do not leave the decision entirely to the reader.

## Workflow

1. **Read the plan in full.** Understand current state, constraints, invariants, architecture direction, phases, and verification before reviewing.
2. **Verify problem framing and direction.** Does the plan solve the right problem? Is the architecture direction sound? Does the chosen approach make sense given the constraints?
3. **Challenge the scope.** With the direction understood, is the scope right? Too big, too small, or missing important dimensions?
4. **Apply remaining review lenses.** Walk through each lens. Produce findings only when something needs to change.
5. **Present findings one at a time.** Each finding includes a recommendation (tighten, cut, defer, or expand). Confirm resolution before moving to the next finding.
6. **Modify the plan.** Apply confirmed changes directly to the plan document. Annotate significant changes with inline HTML comments.

## Review Lenses

Verify each lens against the plan. Produce findings only when something needs to change.

- [ ] **Problem framing.** Does the plan solve the right problem? Is the user intent clear? Are success criteria concrete?
- [ ] **Scope.** Is the scope right? Too big, too small, or missing important dimensions? Are non-goals actually non-goals?
- [ ] **Implementation sequencing.** Are phases ordered correctly? Can each phase be validated independently? Does the sequence minimize risk?
- [ ] **Complexity.** Is the plan overbuilt or underbuilt? Is the complexity justified by the problem?
- [ ] **DRY and maintainability.** Does the plan introduce duplication or patterns that will create maintenance drag?
- [ ] **Testing and verification.** Does the verification section include meaningful tests? Are there gaps? Is anything relying on coverage as a metric instead of behavioral proof?
- [ ] **Performance and operability.** Inefficient queries, threading and concurrency issues, transaction boundaries and partial failure states, unnecessary blocking. Caching only when justified — high-throughput endpoints or expensive calculations, not as a default.
- [ ] **Error handling and observability.** Does the plan address error conventions? Fail-fast behavior, logging, tracing, agent-native observability?
- [ ] **Threat model.** Does the plan introduce trust boundary changes, new attack surface, or auth/authz implications that aren't addressed?

## Annotation Format

Significant changes to the plan are annotated with inline HTML comments:

```html
<!-- plan-review: added threat model consideration for new API surface -->
<!-- plan-review: tightened scope — moved X to deferred work -->
<!-- plan-review: expanded verification to include concurrency proof -->
```

Minor tightening (wording, clarity) does not require annotation.

## Constraints On This Skill

- This skill reviews and modifies plans or brainstorm documents only. It must never generate implementation code.
- Findings are presented one at a time. Confirm resolution before moving to the next.
- Findings must be high-confidence. Do not generate noise.
- Agent-agnostic. No tool-specific or platform-specific references.
