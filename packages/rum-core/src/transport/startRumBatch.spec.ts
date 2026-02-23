import type { PageMayExitEvent } from '@datadog/browser-core'
import { createIdentityEncoder, Observable } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { RumEventType } from '../rawRumEvent.types'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { startRumBatch } from './startRumBatch'

describe('startRumBatch', () => {
  let lifeCycle: LifeCycle
  let sessionExpireObservable: Observable<void>
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    sessionExpireObservable = new Observable<void>()
    interceptor = interceptRequests()

    startRumBatch(
      mockRumConfiguration(),
      lifeCycle,
      () => undefined,
      new Observable<PageMayExitEvent>(),
      sessionExpireObservable,
      () => createIdentityEncoder()
    )
  })

  function flush() {
    sessionExpireObservable.notify()
  }

  it('should route view_update events to batch.add()', () => {
    const viewUpdateEvent = {
      type: RumEventType.VIEW_UPDATE,
      view: { id: 'test-view', time_spent: 0, is_active: true },
      _dd: { document_version: 2 },
    } as unknown as AssembledRumEvent

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewUpdateEvent)
    flush()

    expect(interceptor.requests.length).toBe(1)
    const payload = interceptor.requests[0].body as string
    // view_update events go through add() — written to the encoder immediately,
    // NOT to the upsert buffer. Verify the payload contains our event.
    expect(payload).toContain('"type":"view_update"')
  })

  it('should route view events to batch.upsert()', () => {
    // Send two view events for the same view — upsert should keep only the latest
    const viewEvent1 = {
      type: RumEventType.VIEW,
      view: { id: 'test-view', time_spent: 100, is_active: true },
    } as unknown as AssembledRumEvent

    const viewEvent2 = {
      type: RumEventType.VIEW,
      view: { id: 'test-view', time_spent: 200, is_active: true },
    } as unknown as AssembledRumEvent

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent1)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent2)
    flush()

    expect(interceptor.requests.length).toBe(1)
    const payload = interceptor.requests[0].body as string
    // upsert deduplicates by view.id — only the latest should be present
    expect(payload).toContain('"time_spent":200')
    expect(payload).not.toContain('"time_spent":100')
  })

  it('should preserve all view_update events without deduplication', () => {
    const updates = [1, 2, 3].map(
      (version) =>
        ({
          type: RumEventType.VIEW_UPDATE,
          view: { id: 'same-view', time_spent: version * 100, is_active: true },
          _dd: { document_version: version },
        }) as unknown as AssembledRumEvent
    )

    updates.forEach((event) => lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, event))
    flush()

    expect(interceptor.requests.length).toBe(1)
    const payload = interceptor.requests[0].body as string
    // All three view_update events should be present (add() preserves each one)
    expect(payload).toContain('"document_version":1')
    expect(payload).toContain('"document_version":2')
    expect(payload).toContain('"document_version":3')
  })

  describe('post-assembly strip', () => {
    function makeViewEvent(overrides: Record<string, unknown> = {}): AssembledRumEvent {
      return {
        type: RumEventType.VIEW,
        view: { id: 'view-1', time_spent: 100, is_active: true, url: 'https://example.com', referrer: '' },
        application: { id: 'app-1' },
        session: { id: 'session-1', type: 'user' },
        date: 1000,
        _dd: { document_version: 1 },
        context: { foo: 'bar' },
        connectivity: { status: 'connected', interfaces: ['wifi'] },
        usr: { id: 'user-1', name: 'Alice' },
        account: { id: 'acct-1', name: 'Acme' },
        service: 'my-service',
        version: '1.0.0',
        source: 'browser',
        display: { viewport: { width: 1280, height: 800 } },
        ...overrides,
      } as unknown as AssembledRumEvent
    }

    function makeViewUpdateEvent(overrides: Record<string, unknown> = {}): AssembledRumEvent {
      return {
        type: RumEventType.VIEW_UPDATE,
        view: { id: 'view-1', time_spent: 200, is_active: true, url: 'https://example.com', referrer: '' },
        application: { id: 'app-1' },
        session: { id: 'session-1', type: 'user' },
        date: 2000,
        _dd: { document_version: 2 },
        context: { foo: 'bar' },
        connectivity: { status: 'connected', interfaces: ['wifi'] },
        usr: { id: 'user-1', name: 'Alice' },
        account: { id: 'acct-1', name: 'Acme' },
        service: 'my-service',
        version: '1.0.0',
        source: 'browser',
        display: { viewport: { width: 1280, height: 800 } },
        ...overrides,
      } as unknown as AssembledRumEvent
    }

    it('post-assembly strip removes unchanged context from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      // First line is the VIEW event (upserted), second is VIEW_UPDATE (added)
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.context).toBeUndefined()
    })

    it('post-assembly strip keeps changed context in view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent({ context: { foo: 'changed' } }))
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.context).toEqual({ foo: 'changed' })
    })

    it('post-assembly strip removes unchanged connectivity', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.connectivity).toBeUndefined()
    })

    it('post-assembly strip keeps changed usr', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({ usr: { id: 'user-2', name: 'Bob' } })
      )
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.usr).toEqual({ id: 'user-2', name: 'Bob' })
    })

    it('post-assembly strip always preserves required fields (application.id, session.id, view.id, date, type, _dd.document_version)', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)

      expect(viewUpdate.type).toBe('view_update')
      expect(viewUpdate.date).toBe(2000)
      expect(viewUpdate.application.id).toBe('app-1')
      expect(viewUpdate.session.id).toBe('session-1')
      expect(viewUpdate.view.id).toBe('view-1')
      expect(viewUpdate._dd.document_version).toBe(2)
    })

    it('post-assembly strip does not apply when no snapshot exists', () => {
      // Send view_update WITHOUT a prior VIEW event
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const viewUpdate = JSON.parse(payload.trim())
      // All fields should be present since no snapshot to compare against
      expect(viewUpdate.context).toEqual({ foo: 'bar' })
      expect(viewUpdate.connectivity).toBeDefined()
      expect(viewUpdate.usr).toBeDefined()
    })

    it('snapshot is stored when VIEW event is collected', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      // Send view_update — if snapshot was stored, context will be stripped
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      // context stripped → snapshot was stored
      expect(viewUpdate.context).toBeUndefined()
    })

    it('snapshot is deleted on view end (is_active=false)', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      // End the view
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewEvent({ view: { id: 'view-1', time_spent: 500, is_active: false, url: 'https://example.com', referrer: '' } })
      )
      // Send view_update after view end — snapshot should be gone, no stripping
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body as string
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      // context NOT stripped → snapshot was deleted
      expect(viewUpdate.context).toEqual({ foo: 'bar' })
    })
  })
})
