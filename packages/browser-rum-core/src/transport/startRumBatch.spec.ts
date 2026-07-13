import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { Observable } from '@datadog/browser-core'
import type { FlushEvent } from '@datadog/browser-core/src/transport/flushController'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumViewEvent } from '../rumEvent.types'
import {
  computeAssembledViewDiff,
  createBatchDispatcher,
  PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL,
} from './startRumBatch'
import type { AssembledViewDiff } from './startRumBatch'

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
    expect(result.application).toEqual({ id: 'app-1' })
    expect(result.session).toEqual({ id: 'sess-1', type: 'user' })
    expect(result.view.id).toBe('view-1')
    expect(result.view.url).toBe('/home')
    expect(result._dd?.document_version).toBe(2)
    expect(result._dd?.format_version).toBe(2)
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

    expect(result.view.action).toEqual({ count: 3 }) // changed
    expect(result.view.time_spent).toBe(5000) // changed
    expect(result.view.error).toBeUndefined() // unchanged, stripped
    expect(result.view.name).toBeUndefined() // unchanged, stripped
    expect(result.view.url).toBe('/home') // required routing field, always present
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
    expect(result.version).toBeUndefined() // unchanged, stripped
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
  it('PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL should be 100', () => {
    expect(PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBatch() {
  const flushObservable = new Observable<FlushEvent>()
  const upsertedKeys = new Set<string>()

  const addSpy: Mock<(message: object) => void> = vi.fn()
  const upsertSpy: Mock<(message: object, key: string) => void> = vi.fn()

  const batch = {
    flushObservable,
    get isEmpty() {
      return upsertedKeys.size === 0
    },
    add: addSpy,
    upsert: (message: object, key: string) => {
      upsertedKeys.add(key)
      upsertSpy(message, key)
    },
  }

  return {
    batch,
    addSpy,
    upsertSpy,
    flush: () => {
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
// createBatchDispatcher tests
// ---------------------------------------------------------------------------

describe('createBatchDispatcher', () => {
  describe('feature disabled', () => {
    it('should upsert full VIEW events (legacy behaviour)', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, false)

      const v1 = makeView('view-1', 1)
      const v2 = makeView('view-1', 2)
      dispatch(v1)
      dispatch(v2)

      expect(upsertSpy.mock.calls.length).toBe(2)
      expect((upsertSpy.mock.calls[0][0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.mock.calls[1][0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
    })
  })

  describe('non-view events', () => {
    it('should always append non-view events', () => {
      const { batch, addSpy, upsertSpy } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      const action = { type: RumEventType.ACTION } as unknown as AssembledRumEvent
      dispatch(action)

      expect(addSpy.mock.calls.length).toBe(1)
      expect(upsertSpy.mock.calls.length).toBe(0)
    })
  })

  describe('optimization 1 — VIEW already in batch', () => {
    it('should upsert the latest full VIEW for every intermediate update', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

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
      dispatch(v1) // initial — sets batchHasFullView
      dispatch(v2) // intermediate — opt 1

      // Both calls must be upsert with full VIEW type
      expect(upsertSpy.mock.calls.length).toBe(2)
      expect((upsertSpy.mock.calls[0][0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.mock.calls[1][0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      // Both use the same key (view ID)
      expect(upsertSpy.mock.calls[0][1]).toBe('view-1')
      expect(upsertSpy.mock.calls[1][1]).toBe('view-1')
    })

    it('should not emit any view_update events while the VIEW is in the batch', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      dispatch(makeView('view-1', 2))
      dispatch(makeView('view-1', 3))

      const emittedTypes = upsertSpy.mock.calls.map(([event]) => (event as AssembledRumEvent).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW)).toBe(true)
    })
  })

  describe('optimization 2 — no VIEW in batch (post-flush)', () => {
    it('should upsert an aggregate view_update after a flush', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      flush() // batchHasFullView resets; batchBase = v1

      upsertSpy.mockClear()

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
      dispatch(v2)

      expect(upsertSpy.mock.calls.length).toBe(1)
      const emitted = upsertSpy.mock.calls[0][0] as AssembledRumEvent
      expect(emitted.type).toBe(RumEventType.VIEW_UPDATE)
      expect(upsertSpy.mock.calls[0][1]).toBe('view-1')
    })

    it('should aggregate multiple updates into a single view_update per batch', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      flush()

      upsertSpy.mockClear()

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
      dispatch(makeUpdate(2, 1))
      dispatch(makeUpdate(3, 2))
      dispatch(makeUpdate(4, 3))

      // Each call upserts with the same key — the last one is what gets sent.
      // Assert all three called upsert (not add), all under the same key.
      expect(upsertSpy.mock.calls.length).toBe(3)
      upsertSpy.mock.calls.forEach(([, key]) => expect(key).toBe('view-1'))
      // All emitted events are view_update type (aggregate, not full VIEW)
      const emittedTypes = upsertSpy.mock.calls.map(([e]) => (e as { type: string }).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW_UPDATE)).toBe(true)
    })

    it('should compute the diff from batchBase, not from the previous intermediate update', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      // Initial view with action.count = 0
      dispatch(makeView('view-1', 1))
      flush() // batchBase = v1 (action.count: 0)

      upsertSpy.mockClear()

      // Two intermediate updates: action count goes 0 → 1 → 2
      dispatch(
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
      dispatch(
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
      const lastEmitted = upsertSpy.mock.lastCall![0] as AssembledViewDiff
      expect(lastEmitted.view.action?.count).toBe(2)
    })

    it('should emit nothing if nothing changed since batchBase', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      const v1 = makeView('view-1', 1)
      dispatch(v1)
      flush()

      upsertSpy.mockClear()

      // Same content, only document_version differs (always-required, ignored in diff)
      const v2 = makeView('view-1', 2)
      dispatch(v2)

      expect(upsertSpy.mock.calls.length).toBe(0)
    })
  })

  describe('checkpoint', () => {
    it('should send a full VIEW after PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL intermediate updates', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      flush()

      upsertSpy.mockClear()

      // Trigger exactly PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL updates
      for (let i = 2; i <= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL + 1; i++) {
        dispatch(
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
      const lastEmitted = upsertSpy.mock.lastCall![0] as AssembledRumEvent
      expect(lastEmitted.type).toBe(RumEventType.VIEW)
    })
  })

  describe('view lifecycle', () => {
    it('should send a full VIEW when a new view starts', () => {
      const { batch, upsertSpy } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      dispatch(makeView('view-2', 1)) // new view

      const keys = upsertSpy.mock.calls.map(([, key]) => key)
      expect(keys).toEqual(['view-1', 'view-2'])

      const types = upsertSpy.mock.calls.map(([e]) => (e as AssembledRumEvent).type)
      expect(types).toEqual([RumEventType.VIEW, RumEventType.VIEW])
    })

    it('should send a full VIEW when the view ends', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      flush()

      upsertSpy.mockClear()

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
      dispatch(endView)

      expect(upsertSpy.mock.calls.length).toBe(1)
      expect((upsertSpy.mock.calls[0][0] as AssembledRumEvent).type).toBe(RumEventType.VIEW)
      expect((upsertSpy.mock.calls[0][0] as RumViewEvent).view.is_active).toBe(false)
    })

    it('should upsert a stale view-end without resetting state for the current view', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      // view-1 starts and flushes
      dispatch(makeView('view-1', 1))
      flush()

      // view-2 starts
      dispatch(makeView('view-2', 1))
      upsertSpy.mockClear()

      // stale view-1 end arrives after view-2 has started
      const staleEnd = makeView('view-1', 2, {
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
      dispatch(staleEnd)

      // stale end is upserted under its own key
      expect(upsertSpy.mock.calls.length).toBe(1)
      expect(upsertSpy.mock.calls[0][1]).toBe('view-1')

      // subsequent update for view-2 still uses opt-1 (state for view-2 was not reset)
      dispatch(
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
      const view2Type = (upsertSpy.mock.lastCall![0] as AssembledRumEvent).type
      expect(view2Type).toBe(RumEventType.VIEW)
    })

    it('should reset to opt-1 after a new view starts following a flush', () => {
      const { batch, upsertSpy, flush } = createMockBatch()
      const { dispatch } = createBatchDispatcher(batch, true)

      dispatch(makeView('view-1', 1))
      flush()

      // Start a new view in the next batch
      dispatch(makeView('view-2', 1))
      // Intermediate update for view-2 — should be opt-1 (full VIEW), not opt-2 (view_update)
      dispatch(
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

      const view2Calls = upsertSpy.mock.calls.filter(([, k]) => k === 'view-2')
      const emittedTypes = view2Calls.map(([e]) => (e as AssembledRumEvent).type)
      expect(emittedTypes.every((t) => t === RumEventType.VIEW)).toBe(true)
    })
  })
})
