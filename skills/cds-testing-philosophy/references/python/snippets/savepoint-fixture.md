# SAVEPOINT Rollback Fixture

Per-test database isolation using PostgreSQL SAVEPOINTs with async SQLAlchemy.

## Full fixture setup

```python
import pytest
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncConnection,
    AsyncEngine,
    create_async_engine,
)
from sqlalchemy.orm import Session, SessionTransaction
from sqlalchemy.pool import NullPool
from sqlalchemy import event

TEST_DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/app_test"


@pytest.fixture(scope="session")
async def test_engine():
    """Session-scoped engine — created once, shared across all tests."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="function")
async def db_connection(
    test_engine: AsyncEngine,
) -> AsyncGenerator[AsyncConnection, None]:
    """Function-scoped connection for test isolation."""
    async with test_engine.connect() as conn:
        yield conn


@pytest.fixture(scope="function")
async def db_session(
    db_connection: AsyncConnection,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Clean, rollback-only session for each test.

    Pattern: begin outer transaction -> create session -> begin SAVEPOINT.
    After the test, the outer transaction rolls back everything.
    """
    outer_tx = await db_connection.begin()
    session = AsyncSession(bind=db_connection, expire_on_commit=False)
    nested = await db_connection.begin_nested()

    @event.listens_for(session.sync_session, "after_transaction_end")
    def _end_savepoint(
        _session: Session, _transaction: SessionTransaction
    ) -> None:
        nonlocal nested
        if not nested.is_active and db_connection.sync_connection:
            nested = db_connection.sync_connection.begin_nested()

    try:
        yield session
    finally:
        await session.close()
        await outer_tx.rollback()
```

## How it works

1. **Session-scoped engine** — created once, shared across all tests
2. **Function-scoped connection** — each test gets its own connection
3. **SAVEPOINT wrapping** — an outer transaction wraps the whole test; rolls back after
4. **Auto re-creation** — event listener re-creates the SAVEPOINT after each `session.commit()` within the test

## Prerequisites

- A real PostgreSQL test database with migrations applied
- Never use SQLite as a substitute — dialect differences hide real bugs
