# Enricher API Design Decisions

Date: 2026-03-31

## Naming: Enricher over Decorator

**Decision**: Use `Enricher` instead of `Decorator`.

**Reasoning**: Decorator implies wrapping — taking something and adding a layer around it. Our functions don't wrap events, they contribute attributes. Enricher says exactly what the function does: takes something and adds data to it.

## Simplified API

**Decision**: Replace the `DecoratorFactory` / `Decorator` / `DecoratorResult` / `DecoratorDeps` / `DecorationTrace` / `DecorationStep` layering with a single `Enricher` type.

```ts
type Enricher<TEvent, TRequires = {}, TProvides = {}> = {
  name: string
  setup: () => (event: TEvent, context: TRequires) => Promise<TProvides | null>
}
```

- `TRequires`: what the enricher reads from the accumulated context (typed, not `unknown`)
- `TProvides`: what the enricher contributes to the accumulated context
- `null` return: discard the event
- `setup()`: runs once at seal time, returns the processing function

**What was removed**:
- `DecoratorFactory` / `Decorator` split — merged into single `Enricher` with `setup()`
- `DecoratorResult` discriminated union (`contributed` / `skipped` / `discarded`) — replaced by return value (`TProvides` or `null`)
- `DecoratorDeps` — was always `{}`, removed
- `DecorationTrace` / `DecorationStep` — defined but never used, removed
- `capabilities.canDiscard` — any enricher can discard by returning `null`

## setup() naming

**Decision**: Keep `setup` as the initialization method name.

**Reasoning**: Communicates that it runs once before events flow and returns the actual worker function. `init`, `create`, and `build` were considered — `setup` reads best in context.

## Async requirement

**Decision**: The enricher function must be async (`Promise<TProvides | null>`).

**Reasoning**: Some enrichers need async operations. Making all enrichers async simplifies the pipeline (no sync/async branching) and the sequential processing guarantee is maintained by the pipeline's queue.
