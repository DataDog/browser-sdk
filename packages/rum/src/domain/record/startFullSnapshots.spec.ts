import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import { mockExperimentalFeatures, mockRequestIdleCallback } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../../types'
import { ExperimentalFeature } from '../../../../core/src/tools/experimentalFeatures'
import { RecordType } from '../../types'
import { startFullSnapshots } from './startFullSnapshots'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

describe('startFullSnapshots', () => {
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  let lifeCycle: LifeCycle
  let fullSnapshotPendingCallback: jasmine.Spy<() => void>
  let fullSnapshotReadyCallback: jasmine.Spy<(records: BrowserRecord[]) => void>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    mockExperimentalFeatures([ExperimentalFeature.ASYNC_FULL_SNAPSHOT])
    fullSnapshotPendingCallback = jasmine.createSpy('fullSnapshotPendingCallback')
    fullSnapshotReadyCallback = jasmine.createSpy('fullSnapshotReadyCallback')

    startFullSnapshots(
      createElementsScrollPositions(),
      {} as ShadowRootsController,
      lifeCycle,
      {} as RumConfiguration,
      noop,
      fullSnapshotPendingCallback,
      fullSnapshotReadyCallback
    )
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(fullSnapshotReadyCallback).toHaveBeenCalledTimes(1)
  })

  it('takes a full snapshot when the view changes', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()

    expect(fullSnapshotPendingCallback).toHaveBeenCalledTimes(1)
    expect(fullSnapshotReadyCallback).toHaveBeenCalledTimes(2)
  })

  it('cancels the full snapshot if another view is created before it can it happens', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()
    expect(fullSnapshotPendingCallback).toHaveBeenCalledTimes(2)
    expect(fullSnapshotReadyCallback).toHaveBeenCalledTimes(2)
  })

  it('full snapshot related records should have the view change date', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()

    const records = fullSnapshotReadyCallback.calls.mostRecent().args[0]
    expect(records[0].timestamp).toEqual(1)
    expect(records[1].timestamp).toEqual(1)
    expect(records[2].timestamp).toEqual(1)
  })

  it('full snapshot records should contain Meta, Focus, FullSnapshot', () => {
    const records = fullSnapshotReadyCallback.calls.mostRecent().args[0]

    expect(records).toEqual(
      jasmine.arrayContaining([
        {
          data: {
            height: jasmine.any(Number),
            href: window.location.href,
            width: jasmine.any(Number),
          },
          type: RecordType.Meta,
          timestamp: jasmine.any(Number),
        },
        {
          data: {
            has_focus: document.hasFocus(),
          },
          type: RecordType.Focus,
          timestamp: jasmine.any(Number),
        },
        {
          data: {
            node: jasmine.any(Object),
            initialOffset: {
              left: jasmine.any(Number),
              top: jasmine.any(Number),
            },
          },
          type: RecordType.FullSnapshot,
          timestamp: jasmine.any(Number),
        },
      ])
    )
  })

  it('full snapshot records should contain visualViewport when supported', () => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }
    const records = fullSnapshotReadyCallback.calls.mostRecent().args[0]

    expect(records).toEqual(
      jasmine.arrayContaining([
        {
          data: jasmine.any(Object),
          type: RecordType.VisualViewport,
          timestamp: jasmine.any(Number),
        },
      ])
    )
  })
})
