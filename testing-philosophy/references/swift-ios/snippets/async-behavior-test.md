# Async Behavior Test Pattern

Test outcomes of async operations using simple fakes that return immediately. Use when you don't need to assert on intermediate state.

## Load populates state from service

```swift
import Testing
@testable import MyApp

@Suite("ItemListViewModel Behavior")
@MainActor
struct ItemListViewModelTests {

    private func makeItem(id: UUID, title: String) -> Item {
        Item(id: id, title: title, createdAt: .now)
    }

    @Test("Load populates items from service")
    func loadPopulatesItems() async {
        let items = [
            makeItem(id: UUID(), title: "First"),
            makeItem(id: UUID(), title: "Second"),
        ]
        let service = FakeItemService(items: items)
        let vm = ItemListViewModel(service: service)

        await vm.load()

        #expect(vm.items == items)
        if case .loaded = vm.loadState {
            #expect(true)
        } else {
            #expect(false, "Expected .loaded state")
        }
    }
```

## Service error surfaces as user-facing state

```swift
    @Test("Service error surfaces as user-facing error state")
    func serviceErrorSurfaces() async {
        let service = FakeItemService(items: [])
        await service.setSimulateError(true)
        let vm = ItemListViewModel(service: service)

        await vm.load()

        if case let .error(error) = vm.loadState {
            #expect(error.message == "Something went wrong. Please try again.")
        } else {
            #expect(false, "Expected .error state")
        }
    }
}
```

## Key principles

- Use `@MainActor` here because the ViewModel under test exposes UI-facing state
- Assert on observable outcomes (published properties), not internal calls
- Simple fakes that return immediately — no continuations needed here
- For timing-sensitive tests (asserting in-flight state), use the controlled service pattern instead
