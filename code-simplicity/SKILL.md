---
name: code-simplicity
description: Directly simplify existing code changes for clarity and minimal complexity. Use after writing or modifying code when the user wants unnecessary complexity, defensive patterns, over-abstraction, excess state, or excess line count removed by making edits. Applies to any language. Triggers on direct requests to simplify code, reduce complexity, clean up changes, or make code more elegant. Supports an explicit manual `mode:review` argument for findings-only simplicity review.
argument-hint: "[mode:apply|mode:review] [staged|branch main..HEAD|path/to/file]"
---

# Code Simplicity

Simplify code changes directly. Every line must justify its existence. Prefer deletion over addition, narrowing over widening, and explicitness over flexibility.

## Mode Detection

Check `ARGUMENTS` for `mode:apply` or `mode:review`. If either token is present, strip it from the remaining arguments before interpreting the rest as the simplification target.

If both mode tokens are present, stop and ask.

| Mode | When | Behavior |
|------|------|----------|
| **Apply** (default) | No mode token present, or `mode:apply` in arguments | Simplify the target directly by making edits. |
| **Review** | `mode:review` in arguments | Perform a findings-only simplicity review. Do not edit code. |

## Target Resolution

Determine the simplification target. Accept one of:

- **Staged changes** — the current staged diff.
- **Branch diff** — diff between current branch and base branch.
- **File path** — a specific file or directory to simplify.

If the target is ambiguous, ask.

## Workflow

1. **Resolve mode and target.** Check `ARGUMENTS` for `mode:apply` or `mode:review` first, then resolve the target from the remaining arguments. If no mode token is present, default to `apply` unless the user explicitly requested findings-only behavior.
2. **Run tests.** Verify the existing test suite passes before making any changes. This is the behavioral baseline. In `review` mode, run relevant tests when they materially improve confidence.
3. **Read the changes in full.** Understand what changed and why before simplifying. Note whether the changes are part of an incremental series of diffs — scaffolding for a known next step is not the same as speculative design.
4. **Apply simplicity lenses.** Walk through each lens in a single pass. In `apply` mode, make changes directly. In `review` mode, produce findings only.
5. **Run tests again in `apply` mode.** If any test fails after simplification, investigate: did the simplification change behavior (revert it), or did the test depend on an implementation detail (flag it as a finding)?
6. **Present the results.** In `apply` mode, summarize what changed, why it became simpler, and any residual findings. In `review` mode, present findings only. Group by lens when useful.

## Simplicity Lenses

### 1. Skimmable Code

Code must be understandable at a glance. A reader should grasp the intent without tracing execution paths or holding complex state in their head.

- No clever code. If it requires a "this works because..." explanation, rewrite it.
- Right function granularity — don't shatter logic into too many small functions that force readers to jump around, but don't write functions spanning hundreds of lines either. A function should do one thing at one level of abstraction.
- Flat over nested. Reduce indentation depth. Prefer early returns, guard clauses, and flat control flow over deeply nested conditionals.

### 2. Minimize State

Fewer possible states means fewer bugs. Narrow the state space at every opportunity.

- Reduce argument count. If a function takes many arguments, the design is likely wrong.
- Never make arguments optional if they are actually required. Never pass override/config objects unless strictly necessary.
- Model states as explicit variants to make impossible states unrepresentable. Exhaustively handle all variants — fail on unknown types instead of silently falling through.
- Single source of truth. Don't duplicate state. Derive values instead of storing them.

See language-specific references for variant modeling and exhaustive handling patterns.

### 3. Trust Your Types

Write code that assumes its contracts are met. Push validation to the boundaries, then trust the types internally.

- No defensive code in business logic. Don't null-check values the type system guarantees exist. Don't wrap internal calls in try-catch "just in case."
- Validate at system boundaries (user input, API responses, external data) with schema validation, then trust the validated types downstream.
- Fail fast and loud when expectations are violated — never silently degrade with fallback values. The mechanism (assertions, throws, panics) varies by language.
- Required things must be required. If a parameter is always needed, don't make it optional.

See language-specific references for validation and assertion approaches.

### 4. Minimal Changes

Every change must be strictly necessary. Simplicity means removing, not adding.

- Remove any changes that are not required for the task at hand.
- Between two correct approaches, prefer the one that is easier to follow. Often that is the shorter one, but more lines can be simpler when they make the logic easier to read.
- Delete dead code aggressively. No commented-out code, no unused imports, no "just in case" paths.
- No unnecessary abstraction. Three similar lines are better than a premature helper function. Don't design for hypothetical future requirements — but recognize that incremental work across a series of diffs is not the same as speculative design. Scaffolding for a planned next step is acceptable if it's part of a known iteration.

### 5. Control Flow

- Early returns for deterministic success or error conditions. Handle the simple cases first and return — don't nest the main logic inside conditions.
- When you expect something to exist, fail explicitly rather than catching the error and returning a default. The specific mechanism (assert, throw, panic, precondition) varies by language — see language-specific references.
- Prefer linear flow. If a reader has to jump between multiple functions or trace callbacks to understand what happens, simplify.

### 6. Naming

Names are the primary tool for making code self-documenting. A good name eliminates the need for a comment.

- Names should describe *what*, not *how*. `usersByEmail` not `userMap`. `isExpired` not `checkDateValidity`.
- Naming precision should match scope. Loop variables can be short (`i`, `item`). Module-level functions need descriptive names.
- If you struggle to name something, the abstraction is likely wrong. Rename or restructure instead of adding a comment.

### 7. Comments

Comments explain *why*, never *what*. Code that needs a "what" comment should be rewritten to be self-explanatory.

**Comments belong on:**
- Non-obvious design decisions — why algorithm A over B, why a seemingly redundant check exists.
- Workarounds — browser quirks, platform bugs, with links to issue trackers or references.
- Performance tradeoffs — when readability was intentionally sacrificed for performance.
- TODOs/FIXMEs with ticket references.

**Comments that must be removed:**
- Restating what the code does.
- Commented-out code (use version control).
- Journal-style changelogs in file headers.

**Doc comments:** Required on public API boundaries consumed across modules or by external users. Skip on internal methods where good naming suffices.

### 8. Codebase Consistency

Simplification must respect the existing style and patterns of the codebase. Don't introduce a "better" pattern that conflicts with how the rest of the code works.

- Before changing a pattern, check whether the codebase already has an established convention for it. Follow the existing convention unless there is a strong, articulated reason to diverge.
- If a change introduces a pattern that doesn't exist anywhere else in the codebase, question whether it's truly necessary. First-of-its-kind code deserves extra scrutiny — it may be solving a problem that doesn't need solving, or solving it in a way that creates inconsistency.
- When style drift is detected, assess whether the drift is meaningful (an intentional improvement worth propagating) or accidental (should be reverted to match the codebase). Flag meaningful drift as a finding.

## Language-Specific References

- **TypeScript**: [references/typescript/patterns.md](references/typescript/patterns.md)
- **Python**: [references/python/patterns.md](references/python/patterns.md)
- **Swift/iOS**: [references/swift-ios/patterns.md](references/swift-ios/patterns.md)
- **Go**: [references/go/patterns.md](references/go/patterns.md)

## Constraints

- Default to `apply` mode. Only use `review` mode when `mode:review` appears in `ARGUMENTS` or the user instruction explicitly requests findings-only behavior.
- In `review` mode, do not edit code.
- This skill simplifies existing code or reviews it for simplicity. It does not generate new features or functionality.
- Single pass. Make all changes in one pass in `apply` mode, then present the results at the end. No back-and-forth confirmation loop.
- Findings must be high-confidence. Do not generate noise or nitpick style preferences.
- Simplification must not change behavior. In `apply` mode, run tests before and after. If a test breaks, investigate whether the simplification was wrong or the test was testing an implementation detail — and flag it either way.
