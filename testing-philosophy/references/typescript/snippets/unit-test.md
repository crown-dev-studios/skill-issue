# Unit Test Pattern

Pure logic, no dependencies. Input in, output out. Test decision-making in isolation.

## Route mapping

```typescript
import { describe, expect, it } from 'vitest';
import { RouteController, pathForRoute } from '../src/navigation/routeController';

describe('routeController', () => {
  it('maps route state to expected browser paths', () => {
    expect(pathForRoute({ tab: 'home', itemId: null })).toBe('/');
    expect(pathForRoute({ tab: 'search', itemId: null })).toBe('/search');
    expect(pathForRoute({ tab: 'home', itemId: 'item-1' })).toBe(
      '/items/item-1'
    );
  });
```

## Deduplication — collapse duplicate navigations

```typescript
  it('collapses duplicate same-tick route requests to replace', () => {
    const controller = new RouteController();
    controller.syncCommitted('/');

    const first = controller.decide({ tab: 'home', itemId: 'item-1' }, '/');
    expect(first).toEqual({
      path: '/items/item-1',
      replace: false,
      skip: false,
    });

    // Same navigation again before browser commits: replace instead of push
    const second = controller.decide({ tab: 'home', itemId: 'item-1' }, '/');
    expect(second).toEqual({
      path: '/items/item-1',
      replace: true,
      skip: false,
    });
  });
```

## No-op detection

```typescript
  it('skips no-op navigation when route is already committed', () => {
    const controller = new RouteController();
    controller.syncCommitted('/items/item-1');

    const decision = controller.decide(
      { tab: 'home', itemId: 'item-1' },
      '/items/item-1'
    );
    expect(decision).toEqual({
      path: '/items/item-1',
      replace: true,
      skip: true,
    });
  });
});
```

## Key principles

- No setup overhead — pure functions and simple classes
- Test decision-making logic, not framework plumbing
- Each test is self-contained with clear input/output
