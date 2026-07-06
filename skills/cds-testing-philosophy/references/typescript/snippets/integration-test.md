# Integration Test Pattern

Real database, mocked external services. Each test suite gets its own fresh Postgres database.

## Full example

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';

import { createApp } from '../../src/app.js';
import { createMigratedTestDb } from '../helpers/db.js';
import type { Database } from '../../db/types/schema.js';

describe.sequential('documents integration', () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = await createMigratedTestDb({
      baseDatabaseUrl: env.DATABASE_URL,
      testDatabaseUrl: deriveTestDbUrl(env.DATABASE_URL, 'documents'),
    });

    app = createApp({
      env: createTestEnv({ DATABASE_URL: testDbUrl }),
      db,
      redis: createMemoryRedis(),
      providers: createTestProviders(),
    });
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it('creates a document and retrieves it', async () => {
    const createResponse = await app.request('/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Test Doc', content: 'Hello' }),
    });

    expect(createResponse.status).toBe(201);
    const doc = await createResponse.json();
    expect(doc.title).toBe('Test Doc');

    const getResponse = await app.request(`/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(getResponse.status).toBe(200);
    const retrieved = await getResponse.json();
    expect(retrieved.id).toBe(doc.id);
  });

  it('returns 404 for soft-deleted documents', async () => {
    // Arrange: create and soft-delete a document

    const response = await app.request(`/documents/${deletedId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
  });
});
```

## Key principles

- `createMigratedTestDb()` drops/recreates and runs all migrations per suite
- `describe.sequential()` prevents test races within a suite
- Boot the full app with real DB, fake providers
- Test through the app's request handler for realistic coverage
