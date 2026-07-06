# TypeScript Testing Patterns

## Framework: Vitest

Tests use Vitest with Node.js environment. Organized into:

- `tests/unit/` — pure logic, no external dependencies
- `tests/integration/` — full app bootstrap with real database
- `tests/contracts/` — parity and compatibility checks

## Database Testing: Fresh DB Per Suite

Each integration test suite gets its own Postgres database: drop, create, migrate. This ensures full isolation without SAVEPOINT complexity.

See [snippets/integration-test.md](snippets/integration-test.md).

Key elements:
- `createMigratedTestDb()` drops/recreates and runs all migrations
- `beforeAll` creates the database and boots the app
- `afterAll` destroys connections
- `describe.sequential()` prevents test races within a suite

```typescript
let db: Kysely<Database>;

beforeAll(async () => {
  db = await createMigratedTestDb({
    baseDatabaseUrl: env.DATABASE_URL,
    testDatabaseUrl: deriveTestDatabaseUrl(env.DATABASE_URL)
  });
}, 120_000);

afterAll(async () => {
  await db.destroy();
});
```

## Redis: In-Memory Fake

Use a `Map`-backed fake instead of real Redis. Tests don't need Redis durability or pub/sub — they need key-value storage.

```typescript
function createMemoryRedis(): RedisClient {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value) { store.set(key, { value, expiresAt: null }); },
    async del(key) { store.delete(key); },
    async disconnect() { store.clear(); }
  };
}
```

## External Providers: Mock at the Boundary

Mock AI providers, OAuth services, and external APIs with simple fakes:

```typescript
function createTestProviders(): Providers {
  return {
    assistant: { generate: async (prompt) => `echo: ${prompt}` },
    embedder: { embed: async () => new Array(1024).fill(0) },
    transcriber: { transcribe: async () => "fixture transcript" },
    speech: { synthesize: async () => new Uint8Array() }
  };
}
```

## Unit Tests: Pure Logic

Test decision-making functions with no setup overhead. Input in, output out.

See [snippets/unit-test.md](snippets/unit-test.md).

```typescript
it('collapses duplicate same-tick route requests to replace', () => {
  const controller = new RouteController();
  controller.syncCommitted('/');

  const first = controller.decide({ tab: 'home', itemId: 'item-1' }, '/');
  expect(first).toEqual({ path: '/items/item-1', replace: false, skip: false });

  const second = controller.decide({ tab: 'home', itemId: 'item-1' }, '/');
  expect(second).toEqual({ path: '/items/item-1', replace: true, skip: false });
});
```

## Integration Tests: Real App Instance

Boot the full app with real DB, fake providers, and test through the app's request handler:

```typescript
const app = createApp({
  env: testEnv,
  db,
  redis: createMemoryRedis(),
  providers: createTestProviders()
});

const response = await app.request('/health');
expect(response.status).toBe(200);
```

## Vitest Mocking: Use Sparingly

`vi.fn()`, `vi.stubGlobal()`, and `vi.spyOn()` are available but should be used only when testing interactions with browser globals or third-party APIs where fakes aren't practical. Always clean up in `afterEach`:

```typescript
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```
