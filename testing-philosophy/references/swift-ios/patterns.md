# Swift / iOS Testing Patterns

## Framework: Swift Testing

Use the Swift Testing framework (`@Test`, `@Suite`, `#expect`), not XCTest. Mark the suite or individual test `@MainActor` only when the subject under test is main-actor-isolated or the test directly touches UI state.

```swift
import Testing
@testable import MyApp

@Suite("Feature Description")
@MainActor
struct SomeFeatureTests {
    @Test("describes the behavior being verified")
    func behaviorUnderTest() async { ... }
}
```

## Async Testing Patterns

### Timing-Sensitive: Controlled Services with Continuations

When testing that the system is in a specific state *while* an async operation is in-flight, use a controlled service that can suspend and resume on demand.

See [snippets/controlled-service.md](snippets/controlled-service.md) for the full pattern.

Key elements:
- A behavior enum (`succeed`, `fail`, `suspend`) to control what the fake does
- If the fake is `@MainActor`, the protocol or conformance needs to be `@MainActor` too
- A `CheckedContinuation` stored when the behavior is `.suspend`
- A `resume` method the test calls to unblock the suspended operation
- `Task.yield()` polling to wait for the operation to start (acceptable, not `Task.sleep`)

```swift
@MainActor
@Test("Shows loading state while request is in-flight")
func showsLoadingDuringRequest() async {
    let authService = ControlledAuthService()
    authService.requestBehavior = .suspend

    let vm = LoginViewModel(authService: authService)
    let task = Task { await vm.submitEmail() }

    // Wait for the operation to start
    for _ in 0..<50 {
        if authService.didStartRequest { break }
        await Task.yield()
    }

    // Assert in-flight state
    #expect(vm.state == .loading)

    // Resume and verify completion
    authService.resumeSuccess()
    await task.value
    #expect(vm.state == .loaded)
}
```

### Non-Timing: Simple Fakes

When you only care about the outcome (not the intermediate state), use a fake that returns immediately.

See [snippets/async-behavior-test.md](snippets/async-behavior-test.md).

```swift
let service = FakeItemService(items: expectedItems)
let vm = ItemListViewModel(service: service)
await vm.load()
#expect(vm.items == expectedItems)
```

## Actor Isolation Testing

Test that actor-isolated state remains consistent under concurrent access. Focus on correctness of the isolation boundaries, not internal implementation.

See [snippets/actor-isolation-test.md](snippets/actor-isolation-test.md).

Key concerns:
- Data races: concurrent reads/writes produce correct results
- Reentrancy: add a separate test when an actor method suspends and then resumes
- Snapshot-before-await: add a separate test when correctness depends on state captured before `await`

## Fakes, Not Mocks

All test doubles should conform to the service protocol. They're fakes that return canned data or simulate behavior, not mocks that record calls.

Pattern:
```swift
@MainActor
protocol AuthServiceProtocol {
    func login(email: String, password: String) async throws -> TokenResponse
    func refreshToken() async throws -> TokenResponse
}

final class FakeAuthService: AuthServiceProtocol {
    var loginResult: Result<TokenResponse, Error> = .success(defaultToken)

    func login(email: String, password: String) async throws -> TokenResponse {
        try loginResult.get()
    }

    // Unused protocol methods throw to catch unintended calls
    func refreshToken() async throws -> TokenResponse {
        throw TestError.unexpectedCall
    }
}
```

## Test Naming

Use the `@Test("description")` string to describe the *behavior*, not the method name:

```swift
// Good: describes the behavior
@Test("network failure during OTP shows retryable error and stays on email step")

// Bad: describes the method
@Test("testSubmitEmailNetworkError")
```

## Enum State Helpers

When testing enum-based state, use private helper functions rather than raw `switch`/`case` matching inline:

```swift
private func isEmailStep(_ step: LoginViewModel.Step) -> Bool {
    if case .email = step { return true }
    return false
}
```
