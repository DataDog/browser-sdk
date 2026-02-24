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
    const payload = interceptor.requests[0].body
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
    const payload = interceptor.requests[0].body
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
    const payload = interceptor.requests[0].body
    // All three view_update events should be present (add() preserves each one)
    expect(payload).toContain('"document_version":1')
    expect(payload).toContain('"document_version":2')
    expect(payload).toContain('"document_version":3')
  })

  describe('post-assembly strip', () => {
    const DD_CONFIG = { session_sample_rate: 100, session_replay_sample_rate: 0, format_version: 2 }

    function makeViewEvent(overrides: Record<string, unknown> = {}): AssembledRumEvent {
      return {
        type: RumEventType.VIEW,
        view: {
          id: 'view-1',
          time_spent: 100,
          is_active: true,
          url: 'https://example.com',
          referrer: '',
          name: 'home',
        },
        application: { id: 'app-1' },
        session: { id: 'session-1', type: 'user', sampled_for_replay: false },
        date: 1000,
        _dd: { document_version: 1, format_version: 2, sdk_name: 'rum', configuration: DD_CONFIG },
        context: { foo: 'bar' },
        connectivity: { status: 'connected', interfaces: ['wifi'] },
        usr: { id: 'user-1', name: 'Alice' },
        account: { id: 'acct-1', name: 'Acme' },
        service: 'my-service',
        version: '1.0.0',
        source: 'browser',
        display: { viewport: { width: 1280, height: 800 } },
        ddtags: 'env:staging,service:my-service',
        ...overrides,
      } as unknown as AssembledRumEvent
    }

    function makeViewUpdateEvent(overrides: Record<string, unknown> = {}): AssembledRumEvent {
      return {
        type: RumEventType.VIEW_UPDATE,
        view: {
          id: 'view-1',
          time_spent: 200,
          is_active: true,
          url: 'https://example.com',
          referrer: '',
          name: 'home',
        },
        application: { id: 'app-1' },
        session: { id: 'session-1', type: 'user', sampled_for_replay: false },
        date: 2000,
        _dd: { document_version: 2, format_version: 2, sdk_name: 'rum', configuration: DD_CONFIG },
        context: { foo: 'bar' },
        connectivity: { status: 'connected', interfaces: ['wifi'] },
        usr: { id: 'user-1', name: 'Alice' },
        account: { id: 'acct-1', name: 'Acme' },
        service: 'my-service',
        version: '1.0.0',
        source: 'browser',
        display: { viewport: { width: 1280, height: 800 } },
        ddtags: 'env:staging,service:my-service',
        ...overrides,
      } as unknown as AssembledRumEvent
    }

    it('post-assembly strip removes unchanged display.viewport from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.display).toBeUndefined()
    })

    it('post-assembly strip keeps changed display.viewport in view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({ display: { viewport: { width: 1024, height: 600 } } })
      )
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.display?.viewport).toEqual({ width: 1024, height: 600 })
    })

    it('post-assembly strip removes viewport but keeps scroll when scroll is present', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({ display: { viewport: { width: 1280, height: 800 }, scroll: { max_depth: 500 } } })
      )
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.display?.viewport).toBeUndefined()
      expect(viewUpdate.display?.scroll).toEqual({ max_depth: 500 })
    })

    it('post-assembly strip removes unchanged context from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      // First line is the VIEW event (upserted), second is VIEW_UPDATE (added)
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.context).toBeUndefined()
    })

    it('post-assembly strip removes unchanged view.name from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.view.name).toBeUndefined()
    })

    it('post-assembly strip keeps changed view.name in view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({
          view: {
            id: 'view-1',
            time_spent: 200,
            is_active: true,
            url: 'https://example.com',
            referrer: '',
            name: 'new-page',
          },
        })
      )
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.view.name).toBe('new-page')
    })

    it('post-assembly strip removes _dd.configuration from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate._dd.configuration).toBeUndefined()
      expect(viewUpdate._dd.document_version).toBe(2) // required field kept
    })

    it('post-assembly strip removes _dd.format_version and _dd.sdk_name from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate._dd.format_version).toBeUndefined()
      expect(viewUpdate._dd.sdk_name).toBeUndefined()
    })

    it('post-assembly strip removes session.type from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.session.type).toBeUndefined()
      expect(viewUpdate.session.id).toBe('session-1') // required field kept
    })

    it('post-assembly strip removes ddtags from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.ddtags).toBeUndefined()
    })

    it('post-assembly strip removes viewport on second view_update when unchanged', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      // First view_update: viewport sent (new info, snapshot has it from VIEW event)
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({
          _dd: { document_version: 2, format_version: 2, sdk_name: 'rum', configuration: DD_CONFIG },
        })
      )
      // Second view_update: same viewport — should be stripped now
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({
          _dd: { document_version: 3, format_version: 2, sdk_name: 'rum', configuration: DD_CONFIG },
          date: 3000,
        })
      )
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const updates = lines.filter((l) => l.includes('"view_update"')).map((l) => JSON.parse(l) as Record<string, any>)
      expect(updates).toHaveSize(2)
      // doc_v=2: snapshot has viewport (from VIEW), so viewport stripped
      expect(updates[0]._dd.document_version).toBe(2)
      expect(updates[0].display?.viewport).toBeUndefined()
      // doc_v=3: viewport still stripped (unchanged)
      expect(updates[1]._dd.document_version).toBe(3)
      expect(updates[1].display?.viewport).toBeUndefined()
    })

    it('post-assembly strip keeps changed context in view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent({ context: { foo: 'changed' } }))
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.context).toEqual({ foo: 'changed' })
    })

    it('post-assembly strip removes unchanged connectivity', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
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

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      expect(viewUpdate.usr).toEqual({ id: 'user-2', name: 'Bob' })
    })

    it('post-assembly strip always preserves required fields (application.id, session.id, view.id, date, type, _dd.document_version)', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
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

      const payload = interceptor.requests[0].body
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

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      // context stripped → snapshot was stored
      expect(viewUpdate.context).toBeUndefined()
    })

    it('snapshot backfills usr from first view_update so subsequent ones can strip it', () => {
      // Baseline VIEW has no usr (set after init)
      const baseView = makeViewEvent({ usr: undefined })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, baseView)

      // First VU brings usr — should be sent (new info vs snapshot)
      const vu1 = makeViewUpdateEvent({ _dd: { document_version: 2 }, usr: { id: 'user-1', name: 'Alice' } })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, vu1)

      // Second VU same usr — should be stripped (snapshot now has it)
      const vu2 = makeViewUpdateEvent({ _dd: { document_version: 3 }, usr: { id: 'user-1', name: 'Alice' } })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, vu2)
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const vu1Line = lines.find((l) => l.includes('"document_version":2'))!
      const vu2Line = lines.find((l) => l.includes('"document_version":3'))!
      // First VU: usr present (new info)
      expect(JSON.parse(vu1Line).usr).toEqual({ id: 'user-1', name: 'Alice' })
      // Second VU: usr stripped (unchanged vs backfilled snapshot)
      expect(JSON.parse(vu2Line).usr).toBeUndefined()
    })

    it('strip removes unchanged feature_flags from view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent({ feature_flags: { my_flag: true } }))
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({ feature_flags: { my_flag: true } })
      )
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.feature_flags).toBeUndefined()
    })

    it('strip keeps changed feature_flags in view_update', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent({ feature_flags: { my_flag: true } }))
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({ feature_flags: { my_flag: true, new_flag: false } })
      )
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.feature_flags).toEqual({ my_flag: true, new_flag: false })
    })

    it('snapshot backfills feature_flags from first view_update so subsequent ones can strip it', () => {
      // Baseline VIEW has no feature_flags (flags evaluated after init)
      const baseView = makeViewEvent({ feature_flags: undefined })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, baseView)

      // First VU brings feature_flags — should be sent (new info vs snapshot)
      const vu1 = makeViewUpdateEvent({ _dd: { document_version: 2 }, feature_flags: { my_flag: true } })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, vu1)

      // Second VU same feature_flags — should be stripped (snapshot now has it)
      const vu2 = makeViewUpdateEvent({ _dd: { document_version: 3 }, feature_flags: { my_flag: true } })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, vu2)
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const vu1Line = lines.find((l) => l.includes('"document_version":2'))!
      const vu2Line = lines.find((l) => l.includes('"document_version":3'))!
      expect(JSON.parse(vu1Line).feature_flags).toEqual({ my_flag: true })
      expect(JSON.parse(vu2Line).feature_flags).toBeUndefined()
    })

    it('strip removes _dd.browser_sdk_version from view_update', () => {
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewEvent({
          _dd: {
            document_version: 1,
            format_version: 2,
            sdk_name: 'rum',
            configuration: DD_CONFIG,
            browser_sdk_version: '5.0.0',
          },
        })
      )
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewUpdateEvent({
          _dd: {
            document_version: 2,
            format_version: 2,
            sdk_name: 'rum',
            configuration: DD_CONFIG,
            browser_sdk_version: '5.0.0',
          },
        })
      )
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate._dd.browser_sdk_version).toBeUndefined()
      expect(viewUpdate._dd.document_version).toBe(2)
    })

    it('strip removes unchanged synthetics from view_update', () => {
      const synthetics = { test_id: 'test-1', result_id: 'result-1', injected: true }
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent({ synthetics }))
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent({ synthetics }))
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.synthetics).toBeUndefined()
    })

    it('strip removes unchanged ci_test from view_update', () => {
      const ciTest = { test_execution_id: 'exec-1' }
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent({ ci_test: ciTest }))
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent({ ci_test: ciTest }))
      flush()

      const payload = interceptor.requests[0].body
      const viewUpdate = JSON.parse(
        payload
          .trim()
          .split('\n')
          .find((l) => l.includes('"view_update"'))!
      )
      expect(viewUpdate.ci_test).toBeUndefined()
    })

    it('snapshot is deleted on view end (is_active=false)', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewEvent())
      // End the view
      lifeCycle.notify(
        LifeCycleEventType.RUM_EVENT_COLLECTED,
        makeViewEvent({
          view: { id: 'view-1', time_spent: 500, is_active: false, url: 'https://example.com', referrer: '' },
        })
      )
      // Send view_update after view end — snapshot should be gone, no stripping
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, makeViewUpdateEvent())
      flush()

      const payload = interceptor.requests[0].body
      const lines = payload.trim().split('\n')
      const viewUpdateLine = lines.find((l) => l.includes('"view_update"'))!
      const viewUpdate = JSON.parse(viewUpdateLine)
      // context NOT stripped → snapshot was deleted
      expect(viewUpdate.context).toEqual({ foo: 'bar' })
    })
  })
})
