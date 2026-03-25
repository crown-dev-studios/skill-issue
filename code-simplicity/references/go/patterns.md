# Go Simplicity Patterns

## Variant Modeling with Interfaces

Go lacks discriminated unions, but the idiomatic equivalent is a sealed interface. Each variant struct implements an unexported marker method, which satisfies the interface. Because the method is unexported, only types in the same package can implement it — sealing the set of variants.

```go
type Request interface {
	request() // unexported — only types in this package can implement Request
}

// Each struct implements the request() method, making it a Request.
type Idle struct{}
func (Idle) request() {}

type Loading struct{}
func (Loading) request() {}

type Success struct{ Data ResponseData }
func (Success) request() {}

type Failed struct{ Err error }
func (Failed) request() {}
```

## Exhaustive Handling with Type Switches

Always handle every known type in a type switch. Panic on unknown types to surface bugs immediately rather than silently ignoring them.

```go
func handle(req Request) string {
	switch r := req.(type) {
	case Idle:
		return "Waiting"
	case Loading:
		return "Loading..."
	case Success:
		return r.Data.Message
	case Failed:
		return r.Err.Error()
	default:
		panic(fmt.Sprintf("unhandled request type: %T", req))
	}
}
```

For enum-like behavior, `iota` constants with a string method are simpler than interfaces when there are no associated values:

```go
type Status int

const (
	StatusIdle Status = iota
	StatusLoading
	StatusSuccess
	StatusError
)
```

## Boundary Validation

Validate at system boundaries (HTTP handlers, config loading, external API responses), then pass strongly-typed values internally. The boundary function is the only place that returns errors for invalid input.

```go
type CreateUserInput struct {
	Email string
	Age   int
}

func parseCreateUserInput(r *http.Request) (CreateUserInput, error) {
	var raw struct {
		Email string `json:"email"`
		Age   int    `json:"age"`
	}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		return CreateUserInput{}, fmt.Errorf("invalid JSON: %w", err)
	}
	if raw.Email == "" {
		return CreateUserInput{}, errors.New("email is required")
	}
	if raw.Age <= 0 {
		return CreateUserInput{}, errors.New("age must be positive")
	}
	return CreateUserInput{Email: raw.Email, Age: raw.Age}, nil
}

// Internal code receives validated CreateUserInput — no re-validation
func createUser(input CreateUserInput) *User { ... }
```

## Fail Fast

Use panics for programmer errors — violated invariants and impossible states. Use returned errors for expected failures (I/O, user input, external services).

```go
func mustLoadConfig(env string) Config {
	cfg, ok := configs[env]
	if !ok {
		panic(fmt.Sprintf("no config for environment: %s", env))
	}
	return cfg
}
```

Do not recover from panics to return default values. A panic means the program state is invalid — surface it.

```go
// Bad — hides the bug
func getUser(id string) *User {
	u, ok := users[id]
	if !ok {
		return &User{} // empty default
	}
	return u
}

// Good — surfaces the bug
func getUser(id string) *User {
	u, ok := users[id]
	if !ok {
		panic(fmt.Sprintf("expected user %s to exist", id))
	}
	return u
}
```

## Early Returns and Error Handling

Go's idiomatic `if err != nil { return }` pattern naturally produces flat, linear code. Embrace it — don't fight it with helper abstractions.

```go
func processOrder(order Order) (Receipt, error) {
	if len(order.Items) == 0 {
		return Receipt{}, errors.New("empty cart")
	}
	if order.Payment == nil {
		return Receipt{}, errors.New("no payment method")
	}
	if !order.Payment.IsValid() {
		return Receipt{}, errors.New("invalid payment")
	}

	receipt, err := charge(order.Payment, order)
	if err != nil {
		return Receipt{}, fmt.Errorf("charge failed: %w", err)
	}
	return receipt, nil
}
```

Do not wrap `if err != nil` in helper functions or generics to save lines. The repetition is the readability.

## Argument Reduction

```go
// Bad — too many parameters
func CreateNotification(
	userID string,
	message string,
	channel string,
	priority string,
	retries int,
	template string,
) error { ... }

// Good — required params only
func CreateNotification(userID, message string) error { ... }
```

If a function genuinely needs configuration, use an options struct with no unexported fields — but question each field's necessity first. Avoid the functional options pattern (`WithX()` closures) unless you are building a public library API.

## Simplicity over Abstraction

Go rewards straightforward code. Resist the urge to introduce interfaces, generics, or layers of indirection prematurely.

- Define interfaces at the consumer, not the producer. Only introduce an interface when you have two or more concrete types that need to be interchangeable.
- Avoid generics for code that only has one concrete type today. Write the concrete version first.
- A little duplication is far cheaper than the wrong abstraction.
