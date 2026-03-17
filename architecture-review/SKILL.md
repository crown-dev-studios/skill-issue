---
name: architecture-review
description: Review a plan or implementation for model integrity, service boundaries, and canonical architecture direction. Use when a change touches service boundaries, data models, or trust boundaries.
---

# Architecture Review

## Purpose

Review a plan or implementation for model integrity, service boundaries, and canonical architecture direction before code review.

## When To Use

- A plan of record exists and needs architecture-specific challenge before implementation.
- Implementation is in progress or complete and needs architectural validation before review.
- A change touches service boundaries, data models, or trust boundaries.

## When Not To Use

- No plan exists yet. Use planning first.
- The review is about broad plan quality (scope, sequencing, testing). Use plan-review.
- The review is about code quality, style, or implementation details. Use review.

## Core Principles

1. **Protect the canonical model.** The data model and domain boundaries are the foundation. Changes that weaken them require strong justification.
2. **Boundaries are contracts.** Service boundaries, API surfaces, and module interfaces are explicit contracts. Review for leaky abstractions, responsibility drift, coupling across boundaries, and circular dependencies. In practice: internal types should not surface in consumer APIs, implementation details should not cross service boundaries, and dependency direction should flow inward toward the domain model, not outward toward consumers.
3. **SOLID as a lens, not a dogma.** Use SOLID principles to identify structural problems. Do not flag violations mechanically — flag them when they create real maintenance, extensibility, or correctness risk.
4. **Simplify where possible.** Identify unnecessary abstraction layers, indirection, or complexity that does not serve the architecture. Recommend removal.
5. **Trust boundaries are non-negotiable.** Every trust boundary (user input, external APIs, LLM output, service-to-service) must be explicitly identified and defended.
6. **Recommend the canonical path.** When the architecture drifts from the intended direction, recommend the path back. Do not accept legacy compatibility as a default.

## Target Resolution

Determine the review target. Accept one of:

- **File path** — a plan, brainstorm, or source file to review.
- **Staged changes** — the current staged diff.
- **Branch diff** — diff between current branch and base branch.

If the target is ambiguous, ask.

## Workflow

1. **Read the artifact in full.** Plan, code, or both. Understand the model, boundaries, and architecture direction before reviewing.
2. **Map the architecture.** Identify the key entities, services, boundaries, and trust boundaries. Understand how data flows and who owns what.
3. **Apply review lenses.** Walk through each lens. Produce findings only when something needs to change.
4. **Present findings one at a time.** Each finding includes a recommendation. Confirm resolution before moving to the next.
5. **Modify the artifact.** Apply confirmed changes directly. Annotate significant changes with inline HTML comments.

## Review Lenses

Verify each lens against the artifact. Produce findings only when something needs to change.

- [ ] **Model integrity.** Does the change preserve or strengthen the data model and domain boundaries? Are entities, relationships, and ownership clear?
- [ ] **Service and API boundaries.** Are responsibilities in the correct layer? No leaked abstractions, no coupling across boundaries, dependency direction flows inward toward the domain. Interfaces should be clean and cohesive — not so wide that consumers depend on things they don't use, but not so aggressively split that they fragment the API surface.
- [ ] **Trust boundaries.** Are all trust boundaries (user input, external APIs, LLM output, service-to-service) explicitly identified and defended?
- [ ] **Single responsibility.** Does each module, service, or component have one clear reason to change? Flag god objects, mixed concerns, and responsibility drift.
- [ ] **Open/closed alignment.** Can the architecture be extended without modifying core behavior? Flag designs that require changes to existing contracts to add new capabilities.
- [ ] **Dependency inversion.** Do high-level modules depend on abstractions rather than concrete implementations? Flag hard-wired dependencies that reduce testability or flexibility.
- [ ] **Simplification.** Is there unnecessary abstraction, indirection, or complexity that does not serve the architecture? Recommend removal.
- [ ] **Canonical path.** Does the change strengthen or drift from the intended architecture direction? If drifting, recommend the path back.

## Annotation Format

Significant changes are annotated with inline HTML comments:

```html
<!-- architecture-review: model boundary violation — moved X to correct layer -->
<!-- architecture-review: trust boundary added for LLM output -->
<!-- architecture-review: simplified — removed unnecessary indirection -->
```

Minor tightening does not require annotation.

## Constraints On This Skill

- This skill reviews and modifies plans or code only. It must never generate new implementation code.
- Findings are presented one at a time. Confirm resolution before moving to the next.
- Findings must be high-confidence. Do not generate noise.
- Agent-agnostic. No tool-specific or platform-specific references.
