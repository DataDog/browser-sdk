import { ExperimentalFeature, Observable, addExperimentalFeatures } from '@datadog/browser-core'
import { resetExperimentalFeatures } from '@datadog/browser-core/src/tools/experimentalFeatures'
import type { FlushController, FlushEvent } from '@datadog/browser-core/src/transport/flushController'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumViewEvent } from '../rumEvent.types'
import {
  computeAssembledViewDiff,
  createViewBatchRouter,
  PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL,
} from './startRumBatch'

function makeAssembledView(overrides: Record<string, unknown> = {}): RumViewEvent {
  return {
    type: RumEventType.VIEW,
    date: 1000,
    application: { id: 'app-1' },
    session: { id: 'sess-1', type: 'user' },
    view: {
      id: 'view-1',
      name: 'Home',
      url: '/home',
      referrer: '',
      is_active: true,
      action: { count: 0 },
      error: { count: 0 },
      long_task: { count: 0 },
      resource: { count: 0 },
      time_spent: 0,
    },
    _dd: {
      document_version: 1,
      format_version: 2,
      sdk_name: 'rum',
      configuration: { start_session_replay_recording_manually: false },
    },
    service: 'my-service',
    version: '1.0.0',
    ddtags: 'env:prod',
    source: 'browser',
    context: {},
    ...overrides,
  } as unknown as RumViewEvent
}

describe('computeAssembledViewDiff', () => {
  it('should return undefined when nothing has changed', () => {
    const last = makeAssembledView()
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
    })
    const result = computeAssembledViewDiff(current, last)

    // Only document_version changed (always required, not a "meaningful change")
    // view.* unchanged → should return undefined
    expect(result).toBeUndefined()
  })

  it('should always include required routing fields', () => {
    const last = makeAssembledView()
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
    })
    const result = computeAssembledViewDiff(current, last)!

    expect(result.type).toBe(RumEventType.VIEW_UPDATE)
    expect((result as any).application).toEqual({ id: 'app-1' })
    expect((result as any).session).toEqual({ id: 'sess-1', type: 'user' })
    expect((result.view as any).id).toBe('view-1')
    expect((result.view as any).url).toBe('/home')
    expect((result._dd as any).document_version).toBe(2)
    expect((result._dd as any).format_version).toBe(2)
  })

  it('should include only changed view.* fields', () => {
    const last = makeAssembledView()
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 3 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 5000,
      },
    })
    const result = computeAssembledViewDiff(current, last)!

    expect((result.view as any).action).toEqual({ count: 3 }) // changed
    expect((result.view as any).time_spent).toBe(5000) // changed
    expect((result.view as any).error).toBeUndefined() // unchanged, stripped
    expect((result.view as any).name).toBeUndefined() // unchanged, stripped
    expect((result.view as any).url).toBe('/home') // required routing field, always present
  })

  it('should strip unchanged top-level assembled fields', () => {
    const last = makeAssembledView({ service: 'svc', version: '1.0.0' })
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
      service: 'svc',
      version: '1.0.0',
    })
    const result = computeAssembledViewDiff(current, last)!

    expect(result.service).toBeUndefined() // unchanged, stripped
    expect((result as any).version).toBeUndefined() // unchanged, stripped
  })

  it('should keep top-level assembled fields that changed', () => {
    const last = makeAssembledView({ service: 'old-service' })
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
      service: 'new-service',
    })
    const result = computeAssembledViewDiff(current, last)!

    expect(result.service).toBe('new-service')
  })

  it('should not mutate the input events', () => {
    const last = makeAssembledView()
    const current = makeAssembledView({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
    })
    const currentService = current.service
    computeAssembledViewDiff(current, last)

    expect(current.service).toBe(currentService)
  })
})

describe('startRumBatch partial_view_updates routing', () => {
  beforeEach(() => {
    addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
    registerCleanupTask(resetExperimentalFeatures)
  })

  it('PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL should be 100', () => {
    expect(PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBatch() {
  const flushObservable = new Observable<FlushEvent>()
  let messagesCount = 0
  const upsertedKeys = new Set<string>()

  const addSpy = jasmine.createSpy<(message: object) => void>('add')
  const upsertSpy = jasmine.createSpy<(message: object, key: string) => void>('upsert')

  const batch = {
    flushController: {
      flushObservable,
      get messagesCount() {
        return messagesCount
      },
    } as unknown as FlushController,
    add: addSpy,
    // Simulate real batch: only new keys increment messagesCount (matching notifyBeforeAddMessage)
    upsert: (message: object, key: string) => {
      if (!upsertedKeys.has(key)) {
        messagesCount++
        upsertedKeys.add(key)
      }
      upsertSpy(message, key)
    },
  }

  return {
    batch,
    addSpy,
    upsertSpy,
    flush: () => {
      messagesCount = 0
      upsertedKeys.clear()
      flushObservable.notify({ reason: 'bytes_limit', bytesCount: 0, messagesCount: 0 })
    },
  }
}

function makeView(viewId: string, docVersion: number, overrides: Record<string, unknown> = {}): AssembledRumEvent {
  return makeAssembledView({
    view: {
      id: viewId,
      name: 'Home',
      url: '/home',
      referrer: '',
      is_active: true,
      action: { count: 0 },
      error: { count: 0 },
      long_task: { count: 0 },
      resource: { count: 0 },
      time_spent: 0,
    },
    _dd: {
      document_version: docVersion,
      format_version: 2,
      sdk_name: 'rum',
      configuration: { start_session_replay_recording_manually: false },
    },
    ...overrides,
  }) as unknown as AssembledRumEvent
}

// ---------------------------------------------------------------------------
// createViewBatchRouter tests
// ---------------------------------------------------------------------------

describe('createViewBatchRouter', () => {
  describe('feature flag OFF', () => {
    it('should upsert full VIEW events (legacy behaviour)', () => {
      resetExperimentalFeatures()
      registerCleanupTask(resetExperimentalFeatures)

      const { batch, upsertSpy } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      const v1 = makeView('view-1', 1)
      const v2 = makeView('view-1', 2)
      route(v1)
      route(v2)

      expect(upsertSpy.calls.count()).toBe(2)
      expect((upsertSpy.calls.argsFor(0)[0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.calls.argsFor(1)[0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
    })
  })

  describe('non-view events', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
      registerCleanupTask(resetExperimentalFeatures)
    })

    it('should always append non-view events', () => {
      const { batch, addSpy, upsertSpy } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      const action = { type: RumEventType.ACTION } as unknown as AssembledRumEvent
      route(action)

      expect(addSpy.calls.count()).toBe(1)
      expect(upsertSpy.calls.count()).toBe(0)
    })
  })

  describe('optimization 1 — VIEW already in batch', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
      registerCleanupTask(resetExperimentalFeatures)
    })

    it('should upsert the latest full VIEW for every intermediate update', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      const v1 = makeView('view-1', 1)
      const v2 = makeView('view-1', 2, {
        view: {
          id: 'view-1',
          url: '/home',
          referrer: '',
          is_active: true,
          action: { count: 1 },
          error: { count: 0 },
          long_task: { count: 0 },
          resource: { count: 0 },
          time_spent: 0,
        },
      })
      route(v1) // initial — sets batchHasFullView
      route(v2) // intermediate — opt 1

      // Both calls must be upsert with full VIEW type
      expect(upsertSpy.calls.count()).toBe(2)
      expect((upsertSpy.calls.argsFor(0)[0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.calls.argsFor(1)[0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      // Both use the same key (view ID)
      expect(upsertSpy.calls.argsFor(0)[1]).toBe('view-1')
      expect(upsertSpy.calls.argsFor(1)[1]).toBe('view-1')
    })

    it('should not emit any view_update events while the VIEW is in the batch', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      route(makeView('view-1', 2))
      route(makeView('view-1', 3))

      const emittedTypes = upsertSpy.calls.allArgs().map(([event]) => (event as AssembledRumEvent).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW)).toBeTrue()
    })
  })

  describe('optimization 2 — no VIEW in batch (post-flush)', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
      registerCleanupTask(resetExperimentalFeatures)
    })

    it('should upsert an aggregate view_update after a flush', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      flush() // batchHasFullView resets; batchBase = v1

      upsertSpy.calls.reset()

      const v2 = makeView('view-1', 2, {
        view: {
          id: 'view-1',
          url: '/home',
          referrer: '',
          is_active: true,
          action: { count: 1 },
          error: { count: 0 },
          long_task: { count: 0 },
          resource: { count: 0 },
          time_spent: 0,
        },
      })
      route(v2)

      expect(upsertSpy.calls.count()).toBe(1)
      const emitted = upsertSpy.calls.argsFor(0)[0] as AssembledRumEvent
      expect(emitted.type).toBe(RumEventType.VIEW_UPDATE)
      expect(upsertSpy.calls.argsFor(0)[1]).toBe('view-1')
    })

    it('should aggregate multiple updates into a single view_update per batch', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      flush()

      upsertSpy.calls.reset()

      // Three intermediate updates, each with a distinct action.count so each produces a diff.
      const makeUpdate = (docVersion: number, actionCount: number) =>
        makeView('view-1', docVersion, {
          view: {
            id: 'view-1',
            url: '/home',
            referrer: '',
            is_active: true,
            action: { count: actionCount },
            error: { count: 0 },
            long_task: { count: 0 },
            resource: { count: 0 },
            time_spent: 0,
          },
        })
      route(makeUpdate(2, 1))
      route(makeUpdate(3, 2))
      route(makeUpdate(4, 3))

      // Each call upserts with the same key — the last one is what gets sent.
      // Assert all three called upsert (not add), all under the same key.
      expect(upsertSpy.calls.count()).toBe(3)
      upsertSpy.calls.allArgs().forEach(([, key]) => expect(key).toBe('view-1'))
      // All emitted events are view_update type (aggregate, not full VIEW)
      const emittedTypes = upsertSpy.calls.allArgs().map(([e]) => (e as { type: string }).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW_UPDATE)).toBeTrue()
    })

    it('should compute the diff from batchBase, not from the previous intermediate update', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      // Initial view with action.count = 0
      route(makeView('view-1', 1))
      flush() // batchBase = v1 (action.count: 0)

      upsertSpy.calls.reset()

      // Two intermediate updates: action count goes 0 → 1 → 2
      route(
        makeView('view-1', 2, {
          view: {
            id: 'view-1',
            url: '/home',
            referrer: '',
            is_active: true,
            action: { count: 1 },
            error: { count: 0 },
            long_task: { count: 0 },
            resource: { count: 0 },
            time_spent: 0,
          },
        })
      )
      route(
        makeView('view-1', 3, {
          view: {
            id: 'view-1',
            url: '/home',
            referrer: '',
            is_active: true,
            action: { count: 2 },
            error: { count: 0 },
            long_task: { count: 0 },
            resource: { count: 0 },
            time_spent: 0,
          },
        })
      )

      // The second upsert's aggregate diff must reflect action.count: 2 (diff from base, not from v2)
      const lastEmitted = upsertSpy.calls.mostRecent().args[0] as AssembledRumEvent
      expect((lastEmitted.view as any).action.count).toBe(2)
    })

    it('should emit nothing if nothing changed since batchBase', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      const v1 = makeView('view-1', 1)
      route(v1)
      flush()

      upsertSpy.calls.reset()

      // Same content, only document_version differs (always-required, ignored in diff)
      const v2 = makeView('view-1', 2)
      route(v2)

      expect(upsertSpy.calls.count()).toBe(0)
    })
  })

  describe('checkpoint', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
      registerCleanupTask(resetExperimentalFeatures)
    })

    it('should send a full VIEW after PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL intermediate updates', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      flush()

      upsertSpy.calls.reset()

      // Trigger exactly PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL updates
      for (let i = 2; i <= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL + 1; i++) {
        route(
          makeView('view-1', i, {
            view: {
              id: 'view-1',
              url: '/home',
              referrer: '',
              is_active: true,
              action: { count: i },
              error: { count: 0 },
              long_task: { count: 0 },
              resource: { count: 0 },
              time_spent: 0,
            },
          })
        )
      }

      // The last upserted event must be a full VIEW (checkpoint)
      const lastEmitted = upsertSpy.calls.mostRecent().args[0] as AssembledRumEvent
      expect(lastEmitted.type).toBe(RumEventType.VIEW)
    })
  })

  describe('view lifecycle', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
      registerCleanupTask(resetExperimentalFeatures)
    })

    it('should send a full VIEW when a new view starts', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      route(makeView('view-2', 1)) // new view

      const keys = upsertSpy.calls.allArgs().map(([, key]) => key)
      expect(keys).toEqual(['view-1', 'view-2'])

      const types = upsertSpy.calls.allArgs().map(([e]) => (e as AssembledRumEvent).type)
      expect(types).toEqual([RumEventType.VIEW, RumEventType.VIEW])
    })

    it('should send a full VIEW when the view ends', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      flush()

      upsertSpy.calls.reset()

      const endView = makeView('view-1', 2, {
        view: {
          id: 'view-1',
          url: '/home',
          referrer: '',
          is_active: false,
          action: { count: 0 },
          error: { count: 0 },
          long_task: { count: 0 },
          resource: { count: 0 },
          time_spent: 0,
        },
      })
      route(endView)

      expect(upsertSpy.calls.count()).toBe(1)
      expect((upsertSpy.calls.argsFor(0)[0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.calls.argsFor(0)[0] as any).view.is_active).toBe(false)
    })

    it('should reset to opt-1 after a new view starts following a flush', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { route } = createViewBatchRouter(batch)

      route(makeView('view-1', 1))
      flush()

      // Start a new view in the next batch
      route(makeView('view-2', 1))
      // Intermediate update for view-2 — should be opt-1 (full VIEW), not opt-2 (view_update)
      route(
        makeView('view-2', 2, {
          view: {
            id: 'view-2',
            url: '/home',
            referrer: '',
            is_active: true,
            action: { count: 1 },
            error: { count: 0 },
            long_task: { count: 0 },
            resource: { count: 0 },
            time_spent: 0,
          },
        })
      )

      const view2Calls = upsertSpy.calls.allArgs().filter(([, k]) => k === 'view-2')
      const emittedTypes = view2Calls.map(([e]) => (e as AssembledRumEvent).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW)).toBeTrue()
    })
  })
})
