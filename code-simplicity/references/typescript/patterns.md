# TypeScript Simplicity Patterns

## Discriminated Unions

Use a literal `type` (or `kind`, `status`) field to make impossible states unrepresentable. This replaces optional fields, boolean flags, and loose union types.

```typescript
// Bad — optional fields create ambiguous states
type Request = {
  status: string;
  data?: ResponseData;
  error?: Error;
};

// Good — each state is explicit and self-contained
type Request =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ResponseData }
  | { status: "error"; error: Error };
```

## Exhaustive Handling

Always handle every variant of a discriminated union. Use `never` to catch unhandled cases at compile time.

```typescript
function handleRequest(req: Request): string {
  switch (req.status) {
    case "idle":
      return "Waiting";
    case "loading":
      return "Loading...";
    case "success":
      return req.data.message;
    case "error":
      return req.error.message;
    default: {
      const _exhaustive: never = req;
      throw new Error(`Unhandled status: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

For reusable exhaustive checks:

```typescript
function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
```

## Boundary Validation with Zod

Validate at system boundaries — API responses, user input, environment variables — then trust the inferred types downstream. Never re-validate inside business logic.

```typescript
const UserInput = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

type UserInput = z.infer<typeof UserInput>;

// Validate once at the boundary
function handleCreateUser(raw: unknown): User {
  const input = UserInput.parse(raw); // throws on invalid
  return createUser(input); // input is trusted from here
}
```

Do not use `.optional()` on fields that are actually required. Do not add `.default()` to mask missing data — fail instead.

## Assertion Functions

Use TypeScript assertion functions to narrow types at data loading boundaries. Prefer these over try-catch with fallback values.

```typescript
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) {
    throw new Error(`Expected ${name} to be defined`);
  }
}

// Usage
const user = await db.users.findById(id);
assertDefined(user, "user");
// user is now narrowed to User, not User | null
```

## Strict Configuration

Enable these `tsconfig.json` options to let the compiler enforce simplicity:

- `strict: true` — enables all strict checks
- `noUncheckedIndexedAccess: true` — forces handling of potentially undefined array/object access
- `exactOptionalPropertyTypes: true` — distinguishes `undefined` from missing

## Argument Reduction

```typescript
// Bad — too many parameters, unclear which are required
function createNotification(
  userId: string,
  message: string,
  channel?: string,
  priority?: "low" | "high",
  retries?: number,
  template?: string
) { ... }

// Good — required params are explicit, no unnecessary optionality
function createNotification(userId: string, message: string) { ... }
```

If a function genuinely needs configuration, use a single typed options object — but question each field's necessity first.
