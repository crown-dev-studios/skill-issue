# Service Test Pattern

Test services by calling their methods directly with a real database session. No HTTP layer, no mocking the DB.

## Upsert behavior

```python
@pytest.mark.asyncio
async def test_save_preference_upserts(db_session: AsyncSession) -> None:
    """Saving a preference performs an upsert and commits."""
    service = PreferenceService(db_session)
    payload = PreferenceSaveRequest(
        category="notifications",
        key="email_digest",
        value="weekly",
    )

    saved = await service.save_preference(user_id="user_1", payload=payload)

    assert saved.category == "notifications"
    assert saved.value == "weekly"
```

## Guard clause — reject incomplete input

```python
@pytest.mark.asyncio
async def test_finalize_rejects_incomplete_steps(
    db_session: AsyncSession,
) -> None:
    """Finalizing when required steps are missing returns False."""
    # Arrange: only provide 2 of 3 required steps
    # ... insert partial data ...

    service = WorkflowService(db_session)
    completed = await service.finalize(user_id="user_1")

    assert completed is False
```

## Happy path — all preconditions met

```python
@pytest.mark.asyncio
async def test_finalize_succeeds_when_all_steps_present(
    db_session: AsyncSession,
) -> None:
    """When all required steps are done, finalization succeeds and persists."""
    # Arrange: provide all required steps
    # ... insert all data ...

    service = WorkflowService(db_session)
    completed = await service.finalize(user_id="user_1")

    assert completed is True
    # Verify the result was actually persisted in the database
```

## Key principles

- Call service methods directly — no HTTP plumbing
- Use real database sessions, not mocks
- Assert on observable outcomes (return values + persisted state)
- Service tests answer: "Does the business logic work?"
