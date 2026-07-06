# Swift Simplicity Patterns

## Discriminated Unions

Swift enums with associated values are the language's native discriminated union. Use them to make impossible states unrepresentable.

```swift
// Bad — optional fields create ambiguous states
struct Request {
    var status: String
    var data: ResponseData?
    var error: Error?
}

// Good — each state is explicit and self-contained
enum Request {
    case idle
    case loading
    case success(ResponseData)
    case error(Error)
}
```

## Exhaustive Handling

The compiler enforces exhaustive `switch` statements. Never add a `default` case for known enums — it silences the compiler when new cases are added, hiding bugs.

```swift
func handle(_ request: Request) -> String {
    switch request {
    case .idle:
        return "Waiting"
    case .loading:
        return "Loading..."
    case .success(let data):
        return data.message
    case .error(let error):
        return error.localizedDescription
    }
}
```

When switching over an external enum where exhaustiveness isn't guaranteed, use `@unknown default`:

```swift
switch externalStatus {
case .active: handleActive()
case .inactive: handleInactive()
@unknown default: fatalError("Unhandled status: \(externalStatus)")
}
```

## Boundary Validation

Validate at system boundaries (network responses, user input, decoded JSON), then trust the types internally.

```swift
struct UserInput: Decodable {
    let email: String
    let age: Int
}

func handleCreateUser(data: Data) throws -> User {
    let input = try JSONDecoder().decode(UserInput.self, from: data)
    return createUser(input) // input is trusted from here
}
```

Use non-optional properties for required fields. Do not use `Optional` for fields that are always present — fail at decode time instead of checking later.

## Assertions

Use `precondition` for invariants that must hold in production. Use `assert` for debug-only checks. Use `fatalError` for "this should never happen" branches.

```swift
func loadConfig(for environment: Environment) -> Config {
    guard let config = configs[environment] else {
        preconditionFailure("No config for environment: \(environment)")
    }
    return config
}
```

Prefer `guard let` with `preconditionFailure` over optional chaining with fallback values:

```swift
// Bad — hides the bug
let user = users[id] ?? User.empty

// Good — surfaces the bug
guard let user = users[id] else {
    preconditionFailure("Expected user \(id) to exist")
}
```

## Guard Clauses and Early Returns

Swift's `guard` statement is purpose-built for early returns. Use it to keep the main path at the lowest indentation level.

```swift
func processOrder(_ order: Order) -> Result<Receipt, OrderError> {
    guard order.items.isEmpty == false else {
        return .failure(.emptyCart)
    }
    guard let payment = order.paymentMethod else {
        return .failure(.noPayment)
    }
    guard payment.isValid else {
        return .failure(.invalidPayment)
    }

    // Main logic at top indentation level
    let receipt = charge(payment, for: order)
    return .success(receipt)
}
```

## Argument Reduction

```swift
// Bad — too many parameters, unclear which are required
func createNotification(
    userId: String,
    message: String,
    channel: String? = nil,
    priority: Priority = .low,
    retries: Int = 3,
    template: String? = nil
) { ... }

// Good — required params are explicit, no unnecessary optionality
func createNotification(userId: String, message: String) { ... }
```
