import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { isIE, noop } from '@datadog/browser-core'
import { mockExperimentalFeatures, mockRequestIdleCallback } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../../types'
import { ExperimentalFeature } from '../../../../core/src/tools/experimentalFeatures'
import { startFullSnapshots } from './startFullSnapshots'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

describe('startFullSnapshots', () => {
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  let lifeCycle: LifeCycle
  let fullSnapshotPendingCallback: jasmine.Spy<() => void>
  let fullSnapshotReadyCallback: jasmine.Spy<(records: BrowserRecord[]) => void>
  const originalRequestIdleCallback = window.requestIdleCallback
  const originalCancelIdleCallback = window.cancelIdleCallback

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

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

  afterEach(() => {
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(fullSnapshotPendingCallback).toHaveBeenCalledTimes(1)
    expect(fullSnapshotReadyCallback).toHaveBeenCalledTimes(1)
  })

  it('takes a full snapshot when the view changes', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()

    expect(fullSnapshotPendingCallback).toHaveBeenCalledTimes(2)
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
})
