# Python Testing Patterns

## Framework: pytest + asyncio

All async tests use `pytest.mark.asyncio` (with `asyncio_mode = "auto"` in pyproject.toml). Tests are organized into:

- `tests/unit/` — no database, no external services
- `tests/routers/` — endpoint tests with real database
- `tests/services/` — service-layer tests
- `tests/integration/` — cross-cutting integration tests

## Database Testing: SAVEPOINT Rollback

Use a real Postgres database with per-test SAVEPOINT rollback for isolation. Never use SQLite as a substitute — dialect differences (no `DISTINCT ON`, different JSON ops, no `ARRAY` type) hide real bugs.

See [snippets/savepoint-fixture.md](snippets/savepoint-fixture.md) for the fixture setup.

Key elements:
- **Session-scoped engine**: created once, shared across all tests
- **Function-scoped session**: each test gets its own `AsyncSession` bound to a connection with a SAVEPOINT
- **Automatic rollback**: the outer transaction rolls back after each test, restoring the database to its pre-test state
- **SAVEPOINT re-creation**: an event listener re-creates the savepoint after each `session.commit()` within the test

```python
@pytest.fixture(scope="function")
async def test_db(db_connection):
    outer_tx = await db_connection.begin()
    session = AsyncSession(bind=db_connection, expire_on_commit=False)
    nested = await db_connection.begin_nested()

    @event.listens_for(session.sync_session, "after_transaction_end")
    def _end_savepoint(_session, _transaction):
        nonlocal nested
        if not nested.is_active and db_connection.sync_connection:
            nested = db_connection.sync_connection.begin_nested()

    try:
        yield session
    finally:
        await session.close()
        await outer_tx.rollback()
```

## Router Tests: Use TestClient

Test endpoints through the HTTP layer to verify the full API contract — auth, validation, status codes, response shape. Use `TestClient` or `httpx.AsyncClient`.

See [snippets/router-test.md](snippets/router-test.md).

```python
async def test_create_user_returns_201(client: AsyncClient):
    response = await client.post("/users", json={"email": "new@example.com"})
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"
```

Router tests answer: "Does the API contract work?" They don't test business logic depth — that's what service tests are for.

## Service Tests: Call Directly

Test services by calling their methods directly with a real database session. No HTTP layer, no mocking the DB.

See [snippets/service-test.md](snippets/service-test.md).

```python
async def test_finalize_requires_all_steps(db_session):
    service = WorkflowService(db_session)
    # Insert partial data — only 2 of 3 required steps
    completed = await service.finalize(user_id="user_1")
    assert completed is False
    assert db_session.commit_calls == 0  # nothing persisted
```

## Unit Tests: Fakes for Isolation

When truly unit-testing a service without a database, use hand-written fakes that implement the minimum interface. Not `MagicMock` — explicit fakes that make the test readable.

```python
class FakeSession:
    def __init__(self, results):
        self._results = results
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return self._results.pop(0)
```

Use fakes when:
- The test is purely about logic that happens *between* DB calls
- You need to test error handling for specific DB responses
- Setting up real DB state would be disproportionate to what you're testing

Prefer real DB tests when possible.

## External Services

Mock all external APIs (OAuth, AI providers, third-party services). These are outside your control and introduce flakiness. Use protocol-based fakes or simple stubs.
