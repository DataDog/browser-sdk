# Pipeline Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current `Observable` + `LifeCycle` + `abstractHooks`/`assembly` stack with a unified, typed, async-capable `Pipeline` in `core-next`, and migrate RUM + Logs to use it.

**Architecture:** A generic `Pipeline<TEventMap>` class handles typed pub/sub with an async sequential decorator DAG per event type. Events are buffered and processed one at a time. Decorators are registered before `seal()` is called, after which the DAG is frozen. Each product composes its own event map from package slices using TypeScript intersection types.

**Tech Stack:** TypeScript, Jasmine + Karma (unit tests), Yarn workspaces v4. Run tests with `yarn test:unit --spec <path>`. Run all tests with `yarn test:unit`. Typecheck with `yarn typecheck`. Never use `npm`.

**Design doc:** `.planning/plans/2026-02-20-pipeline-architecture-design.md`

---

## Phase 1 — Core Infrastructure (`core-next`)

### Task 1: Update `Decorator` types to support async and accumulated context

**Files:**

- Modify: `packages/core-next/src/domain/bus/types.ts`

The `Decorator.decorate()` method must become async and receive `accumulated` (attributes contributed by upstream decorators in the same DAG pass). This allows decorators that `requires: ['session']` to read `accumulated.session` from a prior decorator.

**Step 1: Update the `Decorator` interface**

Replace:

```ts
export interface Decorator<TParams = unknown, TAttributes = unknown> {
  decorate(params: TParams): DecoratorResult<TAttributes>
}
```

With:

```ts
export interface Decorator<TEvent = unknown, TAttributes = unknown> {
  decorate(event: TEvent, accumulated: Partial<TAttributes>): Promise<DecoratorResult<TAttributes>>
}
```

Also update the `DecoratorFactory` type parameter names for consistency (`TParams` → `TEvent`):

```ts
export interface DecoratorFactory<TEvent = unknown, TAttributes = unknown> {
  readonly name: string
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  readonly capabilities: {
    readonly canDiscard: boolean
  }
  create(deps: DecoratorDeps): Decorator<TEvent, TAttributes>
}
```

**Step 2: Update `decoratorDag.spec.ts` stub to match new signature**

The `stubFactory` helper creates a decorator returning `{ status: 'skipped' }`. Update its `create` return:

```ts
create: () => ({ decorate: async () => ({ status: 'skipped' as const }) }),
```

**Step 3: Run DAG tests to confirm no regressions**

```bash
yarn test:unit --spec packages/core-next/src/domain/bus/decoratorDag.spec.ts
```

Expected: all 12 tests pass (DAG logic is unchanged).

**Step 4: Commit**

```bash
git add packages/core-next/src/domain/bus/types.ts packages/core-next/src/domain/bus/decoratorDag.spec.ts
git commit -m "♻️ Make Decorator.decorate() async with accumulated context"
```

---

### Task 2: Implement the `Pipeline` class

**Files:**

- Create: `packages/core-next/src/domain/pipeline/pipeline.ts`
- Create: `packages/core-next/src/domain/pipeline/index.ts`

**Step 1: Create the pipeline directory and write the failing test first**

Create `packages/core-next/src/domain/pipeline/pipeline.spec.ts`:

```ts
import { Pipeline } from './pipeline'
import type { DecoratorFactory } from '../bus/types'

function stubFactory(overrides: Partial<DecoratorFactory> & Pick<DecoratorFactory, 'name'>): DecoratorFactory {
  return {
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({ decorate: async () => ({ status: 'skipped' as const }) }),
    ...overrides,
  }
}

describe('Pipeline', () => {
  describe('lifecycle', () => {
    it('should throw if publish() is called before seal()', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      expect(() => pipeline.publish('foo', 'bar')).toThrowError(/sealed/)
    })

    it('should throw if decorate() is called after seal()', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      expect(() => pipeline.decorate('foo', stubFactory({ name: 'test' }))).toThrowError(/sealed/)
    })

    it('should throw if seal() is called twice', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      expect(() => pipeline.seal()).toThrowError(/already sealed/)
    })
  })

  describe('publish / subscribe (no decorators)', () => {
    it('should deliver event to subscriber', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      pipeline.subscribe('foo', (value) => {
        expect(value).toBe('hello')
        done()
      })
      pipeline.publish('foo', 'hello')
    })

    it('should deliver to multiple subscribers', (done) => {
      const pipeline = new Pipeline<{ foo: number }>()
      pipeline.seal()
      let count = 0
      const check = () => {
        if (++count === 2) done()
      }
      pipeline.subscribe('foo', check)
      pipeline.subscribe('foo', check)
      pipeline.publish('foo', 42)
    })

    it('should not deliver to unsubscribed handler', (done) => {
      const pipeline = new Pipeline<{ foo: string; bar: string }>()
      pipeline.seal()
      pipeline.subscribe('bar', () => {
        fail('should not be called')
      })
      pipeline.subscribe('foo', () => done())
      pipeline.publish('foo', 'x')
    })
  })

  describe('subscription cleanup', () => {
    it('should stop delivering after unsubscribe()', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      let calls = 0
      const sub = pipeline.subscribe('foo', () => {
        calls++
      })
      sub.unsubscribe()
      pipeline.subscribe('foo', () => {
        expect(calls).toBe(0)
        done()
      })
      pipeline.publish('foo', 'x')
    })
  })

  describe('decorator DAG', () => {
    it('should deliver enriched event to subscriber', (done) => {
      type Events = { obs: { type: string; sessionId?: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'session',
          provides: ['session'],
          create: () => ({
            decorate: async (event, accumulated) => ({ status: 'contributed', attributes: { sessionId: 'abc-123' } }),
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect(event.sessionId).toBe('abc-123')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should drop event when decorator returns discarded', (done) => {
      type Events = { obs: { type: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'consent',
          capabilities: { canDiscard: true },
          create: () => ({
            decorate: async () => ({ status: 'discarded', reason: 'no consent' }),
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        fail('should not be called')
      })
      // publish two events — after the discarded one, a second should still work
      type Events2 = { obs: { type: string }; signal: string }
      const p2 = new Pipeline<Events2>()
      p2.seal()
      p2.subscribe('signal', () => done())
      p2.publish('signal', 'ok')
    })

    it('should pass accumulated attributes to downstream decorators', (done) => {
      type Events = { obs: { type: string; sessionId?: string; viewId?: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'session',
          provides: ['session'],
          create: () => ({
            decorate: async () => ({ status: 'contributed', attributes: { sessionId: 'sess-1' } }),
          }),
        })
      )
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'view',
          requires: ['session'],
          create: () => ({
            decorate: async (event, accumulated: any) => {
              expect(accumulated.sessionId).toBe('sess-1')
              return { status: 'contributed', attributes: { viewId: 'view-1' } }
            },
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect(event.sessionId).toBe('sess-1')
        expect(event.viewId).toBe('view-1')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should process events sequentially (not concurrently)', (done) => {
      type Events = { obs: { type: string; order?: number } }
      const pipeline = new Pipeline<Events>()
      const processed: number[] = []
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'slow',
          create: () => ({
            decorate: async (event: any) => {
              await new Promise((r) => setTimeout(r, 10))
              processed.push(event.order)
              return { status: 'skipped' as const }
            },
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        if (processed.length === 2) {
          expect(processed).toEqual([1, 2])
          done()
        }
      })
      pipeline.publish('obs', { type: 'x', order: 1 })
      pipeline.publish('obs', { type: 'x', order: 2 })
    })
  })
})
```

**Step 2: Run to confirm tests fail**

```bash
yarn test:unit --spec packages/core-next/src/domain/pipeline/pipeline.spec.ts
```

Expected: FAIL — `Pipeline` not found.

**Step 3: Implement `Pipeline`**

Create `packages/core-next/src/domain/pipeline/pipeline.ts`:

```ts
import { resolveDecoratorOrder } from '../bus/decoratorDag'
import type { Decorator, DecoratorFactory } from '../bus/types'

export interface PipelineSubscription {
  unsubscribe(): void
}

export class Pipeline<TEventMap extends Record<string, unknown>> {
  private factories = new Map<keyof TEventMap, Array<DecoratorFactory<any, any>>>()
  private decorators = new Map<keyof TEventMap, Array<Decorator<any, any>>>()
  private handlers = new Map<keyof TEventMap, Array<(event: any) => void>>()
  private queue: Array<{ type: keyof TEventMap; data: any }> = []
  private processing = false
  private sealed = false

  decorate<K extends keyof TEventMap>(eventType: K, factory: DecoratorFactory<TEventMap[K], any>): void {
    if (this.sealed) {
      throw new Error('Cannot add decorators after pipeline is sealed')
    }
    if (!this.factories.has(eventType)) {
      this.factories.set(eventType, [])
    }
    this.factories.get(eventType)!.push(factory)
  }

  subscribe<K extends keyof TEventMap>(eventType: K, handler: (event: TEventMap[K]) => void): PipelineSubscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    const list = this.handlers.get(eventType)!
    list.push(handler)
    return {
      unsubscribe() {
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      },
    }
  }

  seal(): void {
    if (this.sealed) {
      throw new Error('Pipeline is already sealed')
    }
    this.sealed = true
    for (const [eventType, factories] of this.factories) {
      const sorted = resolveDecoratorOrder(factories)
      this.decorators.set(
        eventType,
        sorted.map((f) => f.create({}))
      )
    }
  }

  publish<K extends keyof TEventMap>(eventType: K, data: TEventMap[K]): void {
    if (!this.sealed) {
      throw new Error('Pipeline must be sealed before publishing events')
    }
    this.queue.push({ type: eventType, data })
    if (!this.processing) {
      void this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      const enriched = await this.runDecorators(item.type, item.data)
      if (enriched !== null) {
        for (const handler of this.handlers.get(item.type) ?? []) {
          handler(enriched)
        }
      }
    }
    this.processing = false
  }

  private async runDecorators<K extends keyof TEventMap>(
    eventType: K,
    data: TEventMap[K]
  ): Promise<TEventMap[K] | null> {
    const decoratorList = this.decorators.get(eventType) ?? []
    let accumulated: Record<string, unknown> = {}

    for (const decorator of decoratorList) {
      const result = await decorator.decorate(data, accumulated)
      if (result.status === 'discarded') {
        return null
      }
      if (result.status === 'contributed') {
        accumulated = { ...accumulated, ...(result.attributes as object) }
      }
    }

    return { ...data, ...accumulated } as TEventMap[K]
  }
}
```

Create `packages/core-next/src/domain/pipeline/index.ts`:

```ts
export { Pipeline } from './pipeline'
export type { PipelineSubscription } from './pipeline'
```

**Step 4: Run tests to confirm they pass**

```bash
yarn test:unit --spec packages/core-next/src/domain/pipeline/pipeline.spec.ts
```

Expected: all tests pass.

**Step 5: Export from `core-next` public API**

In `packages/core-next/src/index.ts`, add:

```ts
export * from './domain/pipeline'
```

**Step 6: Typecheck**

```bash
yarn typecheck
```

Expected: no errors.

**Step 7: Commit**

```bash
git add packages/core-next/src/domain/pipeline/ packages/core-next/src/index.ts
git commit -m "✨ Implement Pipeline class with async sequential decorator DAG"
```

---

## Phase 2 — RUM Event Types

### Task 3: Define `RumCoreEvents`, `RumSignal`, and `Observation`

**Files:**

- Create: `packages/rum-core/src/domain/pipeline/rumPipelineEvents.ts`

**Step 1: Create the type definitions**

```ts
// packages/rum-core/src/domain/pipeline/rumPipelineEvents.ts

export interface Observation {
  readonly type: string
  readonly startTime: number
  readonly duration?: number
  readonly data: Record<string, unknown>
}

export type RumSignal =
  | { type: 'sessionStarted'; sessionId: string }
  | { type: 'sessionExpired' }
  | { type: 'viewCreated'; viewId: string; name?: string }
  | { type: 'pageMayExit'; reason: 'visibility_hidden' | 'before_unload' | 'page_frozen' }

export interface RawResourceData {
  url: string
  method?: string
  statusCode?: number
  startClocks: { relative: number; timeStamp: number }
  duration: number
  size?: number
  // Full type expanded during migration
  [key: string]: unknown
}

export interface RawActionData {
  type: string
  name?: string
  startClocks: { relative: number; timeStamp: number }
  duration?: number
  [key: string]: unknown
}

export type RumCoreEvents = {
  resource: RawResourceData
  action: RawActionData
  observation: Observation
  signal: RumSignal
}
```

**Step 2: Export from `rum-core`**

Add to `packages/rum-core/src/index.ts` (or wherever `rum-core` exports its public API):

```ts
export type {
  Observation,
  RumSignal,
  RumCoreEvents,
  RawResourceData,
  RawActionData,
} from './domain/pipeline/rumPipelineEvents'
```

**Step 3: Typecheck**

```bash
yarn typecheck
```

**Step 4: Commit**

```bash
git add packages/rum-core/src/domain/pipeline/
git commit -m "✨ Define RumCoreEvents, RumSignal, and Observation types"
```

---

## Phase 3 — Migrate Decorators

Each existing `hooks.register(HookNames.Assemble, callback)` becomes a `DecoratorFactory`. The pattern is consistent across all ~16 decorators.

### Task 4: Migrate `trackingConsentContext` decorator (simplest — can discard, no requires)

**Files:**

- Modify: `packages/rum-core/src/domain/contexts/trackingConsentContext.ts`

**Current pattern:**

```ts
hooks.register(HookNames.Assemble, ({ rawRumEvent }) => {
  if (!consent()) return DISCARDED
  return SKIPPED
})
```

**Step 1: Write the failing test**

Create `packages/rum-core/src/domain/contexts/trackingConsentContext.spec.ts` (or add to existing):

```ts
import { trackingConsentDecoratorFactory } from './trackingConsentContext'
import type { Observation } from '../pipeline/rumPipelineEvents'

describe('trackingConsentDecoratorFactory', () => {
  it('should discard observation when consent is not granted', async () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => false })
    const decorator = factory.create({})
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await decorator.decorate(obs, {})
    expect(result.status).toBe('discarded')
  })

  it('should skip observation when consent is granted', async () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    const decorator = factory.create({})
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await decorator.decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: true', () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    expect(factory.capabilities.canDiscard).toBe(true)
  })
})
```

**Step 2: Run test to confirm it fails**

```bash
yarn test:unit --spec packages/rum-core/src/domain/contexts/trackingConsentContext.spec.ts
```

**Step 3: Implement the factory**

In `trackingConsentContext.ts`, add (keep existing `startTrackingConsentContext` for backward compat during migration):

```ts
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { Observation } from '../pipeline/rumPipelineEvents'

export function trackingConsentDecoratorFactory(deps: {
  hasConsent: () => boolean
}): DecoratorFactory<Observation, Record<string, never>> {
  return {
    name: 'trackingConsent',
    provides: [],
    requires: [],
    capabilities: { canDiscard: true },
    create: () => ({
      decorate: async (_event, _accumulated) => {
        if (!deps.hasConsent()) {
          return { status: 'discarded', reason: 'no tracking consent' }
        }
        return { status: 'skipped' }
      },
    }),
  }
}
```

**Step 4: Run tests**

```bash
yarn test:unit --spec packages/rum-core/src/domain/contexts/trackingConsentContext.spec.ts
```

Expected: all pass.

**Step 5: Commit**

```bash
git add packages/rum-core/src/domain/contexts/trackingConsentContext.ts packages/rum-core/src/domain/contexts/trackingConsentContext.spec.ts
git commit -m "✨ Add trackingConsentDecoratorFactory"
```

---

### Task 5: Migrate `sessionContext` decorator (provides: ['session'])

**Files:**

- Modify: `packages/rum-core/src/domain/contexts/sessionContext.ts`

**Step 1: Write the failing test**

```ts
import { sessionDecoratorFactory } from './sessionContext'

describe('sessionDecoratorFactory', () => {
  it('should contribute session attributes', async () => {
    const factory = sessionDecoratorFactory({
      getSession: () => ({ id: 'sess-123', type: 'user', hasReplay: false }),
    })
    const decorator = factory.create({})
    const result = await decorator.decorate({ type: 'error', startTime: 0, data: {} }, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).session.id).toBe('sess-123')
    }
  })

  it('should discard when no active session', async () => {
    const factory = sessionDecoratorFactory({ getSession: () => null })
    const decorator = factory.create({})
    const result = await decorator.decorate({ type: 'error', startTime: 0, data: {} }, {})
    expect(result.status).toBe('discarded')
  })

  it('should declare provides: ["session"]', () => {
    const factory = sessionDecoratorFactory({ getSession: () => null })
    expect(factory.provides).toContain('session')
  })
})
```

**Step 2: Run to confirm failure, then implement:**

```ts
export function sessionDecoratorFactory(deps: {
  getSession: () => { id: string; type: string; hasReplay: boolean } | null
}): DecoratorFactory<Observation, { session: { id: string; type: string; hasReplay: boolean } }> {
  return {
    name: 'session',
    provides: ['session'],
    requires: [],
    capabilities: { canDiscard: true },
    create: () => ({
      decorate: async (_event, _accumulated) => {
        const session = deps.getSession()
        if (!session) {
          return { status: 'discarded', reason: 'no active session' }
        }
        return {
          status: 'contributed',
          attributes: {
            session: { id: session.id, type: session.type, hasReplay: session.hasReplay },
          },
        }
      },
    }),
  }
}
```

**Step 3: Run tests, then commit**

```bash
yarn test:unit --spec packages/rum-core/src/domain/contexts/sessionContext.spec.ts
git add packages/rum-core/src/domain/contexts/sessionContext.ts packages/rum-core/src/domain/contexts/sessionContext.spec.ts
git commit -m "✨ Add sessionDecoratorFactory"
```

---

### Task 6: Migrate remaining decorator factories

Repeat the same pattern (write test → run → implement → run → commit) for each of the following. Each factory follows the same structure — the key differences are `provides`, `requires`, and what attributes are contributed.

**Decorator migration checklist** (one commit per factory):

| Factory                          | File                                                  | provides   | requires      | canDiscard |
| -------------------------------- | ----------------------------------------------------- | ---------- | ------------- | ---------- |
| `viewDecoratorFactory`           | `domain/view/viewCollection.ts`                       | `['view']` | `['session']` | false      |
| `urlContextsDecoratorFactory`    | `domain/contexts/urlContexts.ts`                      | `['url']`  | `[]`          | false      |
| `pageStateDecoratorFactory`      | `domain/contexts/pageStateHistory.ts`                 | `[]`       | `[]`          | false      |
| `connectivityDecoratorFactory`   | `domain/contexts/connectivityContext.ts`              | `[]`       | `[]`          | false      |
| `displayDecoratorFactory`        | `domain/contexts/displayContext.ts`                   | `[]`       | `[]`          | false      |
| `syntheticsDecoratorFactory`     | `domain/contexts/syntheticsContext.ts`                | `[]`       | `[]`          | false      |
| `ciVisibilityDecoratorFactory`   | `domain/contexts/ciVisibilityContext.ts`              | `[]`       | `[]`          | false      |
| `featureFlagDecoratorFactory`    | `domain/contexts/featureFlagContext.ts`               | `[]`       | `[]`          | false      |
| `globalContextDecoratorFactory`  | `packages/core/src/domain/contexts/globalContext.ts`  | `[]`       | `[]`          | false      |
| `userContextDecoratorFactory`    | `packages/core/src/domain/contexts/userContext.ts`    | `[]`       | `[]`          | false      |
| `accountContextDecoratorFactory` | `packages/core/src/domain/contexts/accountContext.ts` | `[]`       | `[]`          | false      |
| `actionContextDecoratorFactory`  | `domain/action/actionCollection.ts`                   | `[]`       | `[]`          | false      |
| `defaultContextDecoratorFactory` | `domain/contexts/defaultContext.ts`                   | `[]`       | `[]`          | false      |
| `sourceCodeDecoratorFactory`     | `domain/contexts/sourceCodeContext.ts`                | `[]`       | `[]`          | false      |
| `profilingDecoratorFactory`      | `domain/profiling/profilingContext.ts`                | `[]`       | `[]`          | false      |

For **`profilingDecoratorFactory`**: the decorator returns `{ status: 'skipped' }` until the profiler bundle loads, then contributes profiling attributes. It must register at startup (in `startRumEventCollection`), not in `profilerApi.onRumStart()`.

---

## Phase 4 — Instantiate the Pipeline in `rum-core`

### Task 7: Create the RUM Pipeline instance and wire decorators

**Files:**

- Create: `packages/rum-core/src/domain/pipeline/createRumPipeline.ts`
- Modify: `packages/rum-core/src/boot/startRumEventCollection.ts`

**Step 1: Create `createRumPipeline`**

```ts
// packages/rum-core/src/domain/pipeline/createRumPipeline.ts
import { Pipeline } from '@datadog/browser-core-next'
import type { RumCoreEvents } from './rumPipelineEvents'

export function createRumPipeline(): Pipeline<RumCoreEvents> {
  return new Pipeline<RumCoreEvents>()
}
```

**Step 2: In `startRumEventCollection`, replace `hooks.register()` calls with `pipeline.decorate()` calls**

Each module that previously called `hooks.register(HookNames.Assemble, callback)` now receives its runtime deps and returns a `DecoratorFactory`. Register each factory on the pipeline:

```ts
// Before (old pattern):
startSessionContext(hooks, sessionManager) // internally calls hooks.register(...)

// After (new pattern):
pipeline.decorate(
  'observation',
  sessionDecoratorFactory({
    getSession: () => sessionManager.findTrackedSession(),
  })
)
```

At the end of `startRumEventCollection`, after all decorators are registered:

```ts
pipeline.seal()
```

**Step 3: Write an integration test for the wired pipeline**

```ts
// packages/rum-core/src/boot/startRumEventCollection.spec.ts (add to existing)
it('should seal the pipeline after registering all decorators', () => {
  // set up mocks for all deps, call startRumEventCollection
  // verify pipeline is sealed (publish does not throw)
  const pipeline = createRumPipeline()
  startRumEventCollection(pipeline /* deps */)
  // If sealed, publish should not throw
  expect(() => pipeline.publish('signal', { type: 'sessionExpired' })).not.toThrow()
})
```

**Step 4: Run tests, typecheck, commit**

```bash
yarn test:unit --spec packages/rum-core/src/boot/startRumEventCollection.spec.ts
yarn typecheck
git add packages/rum-core/src/domain/pipeline/ packages/rum-core/src/boot/startRumEventCollection.ts
git commit -m "✨ Wire RUM pipeline with all decorator factories"
```

---

## Phase 5 — Migrate Collection Modules

### Task 8: Migrate `resourceCollection` to publish to the pipeline

**Files:**

- Modify: `packages/rum-core/src/domain/resource/resourceCollection.ts`

**Current pattern:**

```ts
lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
  rawRumEvent: { type: RumEventType.RESOURCE, ... },
  domainContext: { performanceEntry, xhr, response },
  startClocks,
  duration,
})
```

**New pattern:**

```ts
pipeline.publish('observation', {
  type: 'resource',
  startTime: startClocks.relative,
  duration,
  data: { performanceEntry, xhr, response /* resource-specific fields */ },
})
```

**Step 1: Add test for new publish behavior**

In `resourceCollection.spec.ts`, add a test verifying that `pipeline.publish('observation', ...)` is called with the right shape when a resource completes.

**Step 2: Update `resourceCollection.ts`** to accept `pipeline: Pipeline<RumCoreEvents>` instead of `lifeCycle: LifeCycle`, and call `pipeline.publish('observation', ...)`.

**Step 3: Run tests, commit**

```bash
yarn test:unit --spec packages/rum-core/src/domain/resource/resourceCollection.spec.ts
git add packages/rum-core/src/domain/resource/resourceCollection.ts
git commit -m "♻️ Migrate resourceCollection to publish Observations on Pipeline"
```

---

### Task 9: Migrate remaining collection modules

Repeat Task 8 for each collection module. One commit per module.

| Module               | File                                    | Observation type |
| -------------------- | --------------------------------------- | ---------------- |
| `errorCollection`    | `domain/error/errorCollection.ts`       | `'error'`        |
| `actionCollection`   | `domain/action/actionCollection.ts`     | `'action'`       |
| `viewCollection`     | `domain/view/viewCollection.ts`         | `'view'`         |
| `longTaskCollection` | `domain/longTask/longTaskCollection.ts` | `'long_task'`    |
| `vitalCollection`    | `domain/vital/vitalCollection.ts`       | `'vital'`        |

For `viewCollection`: also migrate `VIEW_CREATED` lifecycle event to `pipeline.publish('signal', { type: 'viewCreated', ... })`.

---

## Phase 6 — Wire Transport

### Task 10: Subscribe transport to `observation` events on the pipeline

**Files:**

- Modify: `packages/rum-core/src/transport/startRumBatch.ts`

**Current pattern:**

```ts
lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => {
  if (isViewEvent(event)) batch.upsert(event, event.view.id)
  else batch.add(event)
})
```

**New pattern:**

```ts
pipeline.subscribe('observation', (enrichedObservation) => {
  const serverEvent = toServerFormat(enrichedObservation)
  if (serverEvent.type === 'view') batch.upsert(serverEvent, serverEvent.view.id)
  else batch.add(serverEvent)
})
```

The `toServerFormat` function converts the enriched Observation (camelCase internal shape) to the final server event shape (snake_case boundary). This is the single serialization point.

**Step 1: Test that transport receives enriched observations**

```ts
it('should add enriched observation to batch', () => {
  // wire pipeline → transport
  // publish observation
  // assert batch.add was called with correct server shape
})
```

**Step 2: Implement, run tests, typecheck, commit**

```bash
yarn test:unit --spec packages/rum-core/src/transport/startRumBatch.spec.ts
yarn typecheck
git commit -m "♻️ Wire transport to subscribe to Pipeline observations"
```

---

## Phase 7 — Migrate Signals

### Task 11: Replace `LifeCycle` coordination events with `signal` pipeline events

For each component that currently uses `lifeCycle.subscribe(SESSION_EXPIRED, ...)` or `lifeCycle.subscribe(SESSION_RENEWED, ...)`, update to:

```ts
pipeline.subscribe('signal', (signal) => {
  if (signal.type === 'sessionExpired') {
    /* ... */
  }
})
```

Components to update (search for `lifeCycle.subscribe` usages):

- Session Replay recorder (`packages/rum/src/boot/recorderApi.ts`)
- Segment collection (`packages/rum/src/domain/segmentCollection/segmentCollection.ts`)
- Any component subscribing to `PAGE_MAY_EXIT`, `SESSION_EXPIRED`, `SESSION_RENEWED`, `VIEW_CREATED`

One commit per component.

---

## Phase 8 — Migrate `logs`

### Task 12: Create `LogsEvents` and migrate Logs to use Pipeline

**Files:**

- Create: `packages/logs/src/domain/pipeline/logsPipelineEvents.ts`
- Modify: `packages/logs/src/boot/startLogs.ts`
- Modify: `packages/logs/src/domain/assembly.ts` (replace with pipeline + decorators)

**Step 1: Define `LogsEvents`**

```ts
export type LogsSignal = { type: 'sessionStarted'; sessionId: string } | { type: 'sessionExpired' }

export type LogsEvents = {
  observation: Observation
  signal: LogsSignal
}
```

**Step 2: Create logs decorator factories** — `sessionDecoratorFactory`, `trackingConsentDecoratorFactory`, `rumInternalContextDecoratorFactory` (same pattern as Phase 3).

**Step 3: Wire pipeline in `startLogs`, seal, subscribe transport to `observation`.**

**Step 4: Run all unit tests, typecheck, commit**

```bash
yarn test:unit
yarn typecheck
git commit -m "♻️ Migrate Logs to Pipeline architecture"
```

---

## Phase 9 — Cleanup

### Task 13: Remove `LifeCycle`, `abstractHooks`, `Hooks`, and `assembly.ts`

Only after all modules are migrated and all tests pass.

**Step 1: Delete or empty these files:**

- `packages/core/src/tools/abstractLifeCycle.ts`
- `packages/rum-core/src/domain/lifeCycle.ts`
- `packages/core/src/tools/abstractHooks.ts`
- `packages/rum-core/src/domain/hooks.ts`
- `packages/rum-core/src/domain/assembly.ts`
- `packages/logs/src/domain/lifeCycle.ts`

**Step 2: Remove all imports of `LifeCycle`, `LifeCycleEventType`, `HookNames`, `Hooks`**

Search: `grep -r "LifeCycle\|HookNames\|abstractHooks" packages/ --include="*.ts" -l`

**Step 3: Run full test suite and typecheck**

```bash
yarn test:unit
yarn typecheck
```

Expected: all tests pass, no type errors.

**Step 4: Commit**

```bash
git commit -m "🔥 Remove LifeCycle, abstractHooks, and assembly — replaced by Pipeline"
```

---

## Verification Checklist

Before considering this plan complete:

- [ ] `yarn test:unit` — all tests pass
- [ ] `yarn typecheck` — zero type errors
- [ ] `yarn lint` — no lint violations
- [ ] No remaining imports of `LifeCycle`, `HookNames`, `abstractHooks`, or `startRumAssembly`
- [ ] `pipeline.seal()` is called before any events are published in all boot paths
- [ ] Profiler decorator registered at startup (not in `profilerApi.onRumStart`)
- [ ] `DecorationTrace` emitted for each enriched observation (for debugging/telemetry)
