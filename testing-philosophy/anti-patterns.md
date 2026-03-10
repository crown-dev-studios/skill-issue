# Anti-Patterns

Tests to never write, with examples of what to write instead.

## 1. Property Echo Tests

```swift
// BAD: Testing that assignment works
@Test func viewModelStoresEmail() {
    let vm = LoginViewModel(authService: FakeAuthService())
    vm.email = "test@example.com"
    #expect(vm.email == "test@example.com")
}
```

This tests Swift's property storage, not your code. Delete it.

## 2. Computed Property Without Behavior

```swift
// BAD: Testing a trivial derivation
@Test func submitDisabledForInvalidEmail() {
    let vm = LoginViewModel(authService: FakeAuthService())
    vm.email = "not-an-email"
    #expect(!vm.isSubmitEnabled)
}
```

Unless `isSubmitEnabled` contains meaningful validation logic with edge cases, this tests a simple boolean expression. The behavior test is: "submitting an invalid email produces an error" — test that instead.

## 3. Mock Assertion Soup

```python
# BAD: Testing internal wiring, not behavior
async def test_save_calls_execute_and_commit():
    mock_db = MagicMock()
    service = MyService(mock_db)
    await service.save(data)

    mock_db.execute.assert_called_once()
    mock_db.commit.assert_called_once()
```

This breaks if the implementation changes how it talks to the database, even if the behavior is identical. Test the outcome instead: did the data get persisted? Did the service return the right thing?

## 4. Task.sleep for Timing

```swift
// BAD: Flaky, slow, non-deterministic
@Test func loadingStateAppearsWhileFetching() async {
    let vm = SomeViewModel(service: SlowFakeService())
    Task { await vm.load() }
    try await Task.sleep(for: .milliseconds(100))
    #expect(vm.state == .loading)
}
```

Use a controlled service with continuation-based suspend/resume. See [swift-ios/snippets/controlled-service.md](references/swift-ios/snippets/controlled-service.md).

## 5. Coverage-Driven Tests

```swift
// BAD: Exercising a path without verifying behavior
@Test func initDoesNotCrash() {
    _ = SomeViewModel(service: FakeService())
}
```

This adds to coverage numbers but proves nothing. If the initializer can fail, test the failure mode. If it can't, don't test it.

## 6. Testing Framework Wiring

```python
# BAD: Testing that FastAPI dependency injection works
async def test_endpoint_injects_db():
    response = client.get("/users")
    assert response.status_code == 200  # only proves DI didn't crash
```

Test that the endpoint returns the right data for a given state, not that the framework assembled the handler correctly.

## 7. Mocking What You Own

```swift
// BAD: Mocking your own model layer
let mockUser = Mock<User>()
mockUser.when(\.name).thenReturn("Test")
```

Create a real `User` instance. Mocking your own value types or models means you're not testing against real behavior. Reserve mocking for boundaries you don't control.

## 8. Snapshot / View Tests

Do not write SwiftUI preview tests, snapshot tests, or view-level assertions. They are brittle, hard to maintain, and test rendering implementation rather than behavior. Test the ViewModel that drives the view.
