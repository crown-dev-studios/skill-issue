# Controlled Service Pattern

Test timing-sensitive async behavior by controlling when async operations complete. Use when you need to assert on intermediate state (e.g., loading state while a request is in-flight).

## Full pattern

```swift
@MainActor
protocol AuthServiceProtocol {
    var authState: AuthState { get set }
    func requestOTP(email: String) async throws
}

@MainActor
private final class ControlledAuthService: AuthServiceProtocol {
    enum Behavior {
        case succeed
        case fail(Error)
        case suspend  // pauses until test explicitly resumes
    }

    var authState: AuthState = .unauthenticated
    var requestBehavior: Behavior = .succeed
    var callCount = 0
    var didStartRequest = false

    private var suspendedContinuation: CheckedContinuation<Void, Error>?

    func requestOTP(email _: String) async throws {
        callCount += 1
        didStartRequest = true

        switch requestBehavior {
        case .succeed:
            return
        case let .fail(error):
            throw error
        case .suspend:
            try await withCheckedThrowingContinuation { continuation in
                suspendedContinuation = continuation
            }
        }
    }

    func resumeSuccess() {
        suspendedContinuation?.resume(returning: ())
        suspendedContinuation = nil
    }

    func resumeFailure(_ error: Error) {
        suspendedContinuation?.resume(throwing: error)
        suspendedContinuation = nil
    }
}
```

## Usage in a test

```swift
@MainActor
@Test("Shows loading state while request is in-flight")
func showsLoadingDuringRequest() async {
    let service = ControlledAuthService()
    service.requestBehavior = .suspend

    let vm = LoginViewModel(authService: service)
    let task = Task { await vm.submitEmail() }

    // Wait for the operation to start
    for _ in 0..<50 {
        if service.didStartRequest { break }
        await Task.yield()
    }

    // Assert in-flight state
    #expect(vm.state == .loading)

    // Resume and verify completion
    service.resumeSuccess()
    await task.value
    #expect(vm.state == .loaded)
}
```

## Key principles

- Behavior enum lets tests choose the outcome per-call
- Main-actor-isolated fakes require a main-actor-isolated protocol or conformance too
- `CheckedContinuation` suspends until the test explicitly resumes
- `Task.yield()` polling to wait for operation start (acceptable, not `Task.sleep`)
- Unused protocol methods should throw to catch unintended calls
