---
name: testing-philosophy
description: Testing philosophy and conventions. Use when writing, generating, modifying, or auditing test files. Covers behavior-driven testing, async patterns, database testing, and language-specific practices for Swift, Python, and TypeScript.
---

# Test Philosophy

This skill defines the testing principles for this codebase. Apply these when writing new tests, modifying existing tests, or reviewing test code.

## Core Principle

**A test should prove the system does the right thing in response to a stimulus, not that it's wired up correctly.**

Every test must exercise a decision the code makes. If the code under test doesn't make a decision in the scenario you're testing, the test has no value.

## Principles

### 1. Test Behavior, Not Construction

Never test that a property holds the value you just assigned. Never test that an initializer sets fields. Test what happens when the system *acts* on its state.

**Valuable:** "When the service rejects an unsupported sample rate, recording fails with a specific error."
**Worthless:** "The service has a `sampleRate` property set to 44100."

### 2. Error Categories, Not Error Variants

Test one representative from each user-facing error *category* — retryable, permanent, validation. If `NetworkError` has `.timeout`, `.noConnection`, `.dnsFailure`, pick one. They produce the same UX behavior. Add a variant test only when the *behavior* diverges (e.g., 401 triggers logout vs. 500 shows retry).

### 3. Fakes by Default, Mocks Rarely

- **Fakes**: lightweight protocol conformances that return canned data or simulate behavior. Use these as the standard approach for replacing dependencies.
- **Mocks**: objects that record calls and assert on them. Use *only* when you need to verify that something was called or how it was called — and even then, question whether you can assert on an observable outcome instead.

If you find yourself asserting `mock.methodWasCalledWith(args)`, ask: is there an observable side effect I can check instead? Mocks test wiring. Fakes test behavior.

### 4. Tests as Logical Blocks

No dogma about one assertion per test. A test should be a coherent scenario — set up a situation, perform an action, verify the outcomes. Multiple assertions that validate different facets of the same behavior belong together. But don't test unrelated behaviors in a single test.

### 5. Predictable Async, Not Time-Based Waiting

**Never use `Task.sleep` or time-based delays in tests.** Control the stimulus deterministically:

- For timing-sensitive behavior (e.g., testing that UI stays in a loading state while a request is in-flight): use continuation-based controlled services that suspend and resume on command.
- For non-timing behavior (e.g., testing the outcome after an async operation completes): use simple fakes that return immediately.

The principle: **control the stimulus, don't observe the timing.**

### 6. Test Against Production Infrastructure

Test against the same database engine you run in production. No SQLite stand-ins for Postgres. The dialect differences will hide real bugs and surface fake ones.

- **Python (SQLAlchemy):** SAVEPOINT rollback with real Postgres — see [python/patterns.md](references/python/patterns.md)
- **TypeScript (Kysely):** Fresh test database per suite with real Postgres — see [typescript/patterns.md](references/typescript/patterns.md)
- **External services** (Redis, OAuth, AI providers): mock these. They're outside your control and slow. Use in-memory fakes.

### 7. Coverage Is Not a Metric

Do not optimize for percentage coverage. Coverage tells you what code was executed, not whether it was meaningfully tested. A test that exercises a code path without verifying behavior inflates coverage and provides false confidence.

### 8. No View-Level or UI Tests

UI tests are the most flaky category of test. Do not write SwiftUI view tests or snapshot tests. Test ViewModels and services instead — they contain the decisions.

## Test Layer Split

### Router/Endpoint Tests

Test through the HTTP layer (e.g., `TestClient`, `httpx.AsyncClient`, or app instance). These verify the API contract: authentication, request validation, status codes, response shape.

### Service Tests

Call the service directly. These verify business logic with real dependencies (database). Don't duplicate what router tests already cover.

### Pure Logic Tests

No dependencies. Input in, output out. Test decision-making in isolation.

## Language-Specific References

- **Swift/iOS**: [references/swift-ios/patterns.md](references/swift-ios/patterns.md)
- **Python**: [references/python/patterns.md](references/python/patterns.md)
- **TypeScript**: [references/typescript/patterns.md](references/typescript/patterns.md)
- **Anti-patterns**: [anti-patterns.md](anti-patterns.md)
