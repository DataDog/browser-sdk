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
      view: { id: 'test-view', time_spent: 100 },
    } as unknown as AssembledRumEvent

    const viewEvent2 = {
      type: RumEventType.VIEW,
      view: { id: 'test-view', time_spent: 200 },
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
})
