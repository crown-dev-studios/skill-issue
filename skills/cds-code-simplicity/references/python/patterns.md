# Python Simplicity Patterns

## Discriminated Unions

Use `Literal` types with a discriminator field and `Union` to constrain possible states. Python 3.10+ `match` statements provide exhaustive handling.

```python
from typing import Literal, Union
from dataclasses import dataclass

@dataclass
class Idle:
    status: Literal["idle"] = "idle"

@dataclass
class Loading:
    status: Literal["loading"] = "loading"

@dataclass
class Success:
    data: ResponseData
    status: Literal["success"] = "success"

@dataclass
class Failed:
    error: str
    status: Literal["error"] = "error"

Request = Union[Idle, Loading, Success, Failed]
```

## Exhaustive Handling

Use `match` with `assert_never` to catch unhandled variants at type-check time (mypy/pyright).

```python
from typing import Never, assert_never

def handle_request(req: Request) -> str:
    match req:
        case Idle():
            return "Waiting"
        case Loading():
            return "Loading..."
        case Success(data=data):
            return data.message
        case Failed(error=error):
            return error
        case _ as unreachable:
            assert_never(unreachable)
```

Without `match` (Python <3.10), use `isinstance` chains with an explicit `else` that raises:

```python
def handle_request(req: Request) -> str:
    if isinstance(req, Idle):
        return "Waiting"
    elif isinstance(req, Loading):
        return "Loading..."
    elif isinstance(req, Success):
        return req.data.message
    elif isinstance(req, Failed):
        return req.error
    else:
        assert_never(req)
```

## Boundary Validation with Pydantic

Validate at system boundaries with Pydantic models. Trust the validated types internally — no re-validation in business logic.

```python
from pydantic import BaseModel, EmailStr, Field

class UserInput(BaseModel):
    email: EmailStr
    age: int = Field(gt=0)

# Validate once at the boundary
def handle_create_user(raw: dict) -> User:
    input = UserInput.model_validate(raw)  # raises on invalid
    return create_user(input)  # input is trusted from here
```

Do not use `Optional` on fields that are actually required. Do not add default values to mask missing data.

## Assertions

Use `assert` statements to enforce invariants at data boundaries. Prefer assertions over catching exceptions and returning defaults.

```python
def load_config(env: str) -> Config:
    config = configs.get(env)
    assert config is not None, f"No config for environment: {env}"
    return config

user = db.users.get(user_id)
assert user is not None, f"User {user_id} not found"
```

For production code where assertions may be stripped (`python -O`), use explicit raises:

```python
from typing import TypeVar

T = TypeVar("T")

def require(value: T | None, name: str) -> T:
    if value is None:
        raise ValueError(f"Expected {name} to be defined")
    return value
```

## Argument Reduction

```python
# Bad — too many parameters, unclear which are required
def send_notification(
    user_id: str,
    message: str,
    channel: str | None = None,
    priority: str = "low",
    retries: int = 3,
    template: str | None = None,
) -> None: ...

# Good — required params are explicit, no unnecessary optionality
def send_notification(user_id: str, message: str) -> None: ...
```

Use `@dataclass` or Pydantic models for genuinely complex configuration — but question each field's necessity first.
