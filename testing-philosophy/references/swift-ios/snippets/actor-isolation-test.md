# Actor Isolation Test Pattern

Verify correctness of actor-isolated state under concurrent access. Focus on data consistency, not internal scheduling. This example covers contention and lost-write behavior, not reentrancy across suspension points.

## Setup helper

```swift
import Testing
@testable import MyApp

@Suite("SyncEngine Concurrent Access")
struct SyncEngineConcurrencyTests {

    private func makeItem(id: UUID, title: String) -> SyncItem {
        SyncItem(
            id: id,
            kind: .document,
            title: title,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }
```

## Deduplication — last writer wins

```swift
    @Test("Remote snapshot deduplicates by id — last writer wins")
    func remoteSnapshotDeduplicatesById() async {
        let id = UUID()
        let older = makeItem(id: id, title: "Old")
        let newer = makeItem(id: id, title: "New")

        let engine = SyncEngine()
        let result = await engine.applySnapshot(source: .remote, items: [older, newer])

        #expect(result.count == 1)
        #expect(result.first?.title == "New")
    }
```

## Local overrides remote

```swift
    @Test("Local upsert overrides remote for the same id")
    func localOverridesRemote() async {
        let id = UUID()
        let remote = makeItem(id: id, title: "Remote")
        let local = makeItem(id: id, title: "Local")

        let engine = SyncEngine()
        _ = await engine.applySnapshot(source: .remote, items: [remote])
        let result = await engine.upsert(source: .local, item: local)

        #expect(result.count == 1)
        #expect(result.first?.title == "Local")
    }
```

## Concurrent upserts produce consistent state

```swift
    @Test("Concurrent upserts from multiple tasks produce consistent state")
    func concurrentUpsertsAreConsistent() async {
        let engine = SyncEngine()
        let ids = (0..<20).map { _ in UUID() }

        await withTaskGroup(of: Void.self) { group in
            for id in ids {
                group.addTask {
                    _ = await engine.upsert(
                        source: .local,
                        item: makeItem(id: id, title: "Item-\(id.uuidString.prefix(4))")
                    )
                }
            }
        }

        // All items should be present — no lost writes
        let final = await engine.currentItems()
        let finalIds = Set(final.map(\.id))
        for id in ids {
            #expect(finalIds.contains(id))
        }
    }
}
```

## Key principles

- Test data consistency, not actor scheduling internals
- Use `withTaskGroup` to simulate concurrent access
- Assert that no writes are lost under contention
- Add a separate test for reentrancy if an actor method suspends internally
- Focus on isolation boundaries, not implementation details
