# Router Test Pattern

Test through the HTTP layer to verify the full API contract: auth, validation, status codes, response shape.

## Happy path — verify persistence and response

```python
@pytest.mark.asyncio
async def test_update_settings_persists_changes(
    db_session: AsyncSession,
) -> None:
    """Updating settings persists the new values and returns 200."""
    # Arrange
    user = DBUser(id="test-user", email="test@example.com")
    db_session.add(user)
    await db_session.flush()

    # Act
    response = await client.patch(
        f"/users/{user.id}/settings",
        json={"theme": "dark", "locale": "en-US"},
    )

    # Assert
    assert response.status_code == 200
    reloaded = await db_session.get(DBUser, user.id)
    assert reloaded.settings["theme"] == "dark"
```

## Error path — reject invalid input

```python
@pytest.mark.asyncio
async def test_update_settings_rejects_unknown_field(
    db_session: AsyncSession,
) -> None:
    """Referencing an unknown settings key returns 400."""
    # ... arrange ...

    response = await client.patch(
        f"/users/{user.id}/settings",
        json={"nonexistent_key": "value"},
    )

    assert response.status_code == 400
```

## Key principles

- Use `TestClient` or `httpx.AsyncClient` to hit the actual endpoint
- Real database session with SAVEPOINT rollback for isolation
- Router tests answer: "Does the API contract work?"
- Don't test business logic depth here — that's what service tests are for
