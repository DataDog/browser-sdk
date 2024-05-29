import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { isIE, noop } from '@datadog/browser-core'
import { mockRequestIdleCallback } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../../types'
import { addExperimentalFeatures, ExperimentalFeature } from '../../../../core/src/tools/experimentalFeatures'
import { startFullSnapshots } from './startFullSnapshots'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

describe('startFullSnapshots', () => {
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  let lifeCycle: LifeCycle
  let fullSnapshotCallback: jasmine.Spy<(records: BrowserRecord[]) => void>
  const originalRequestIdleCallback = window.requestIdleCallback
  const originalCancelIdleCallback = window.cancelIdleCallback

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    lifeCycle = new LifeCycle()
    addExperimentalFeatures([ExperimentalFeature.ASYNC_FULL_SNAPSHOT])
    fullSnapshotCallback = jasmine.createSpy()
    startFullSnapshots(
      createElementsScrollPositions(),
      {} as ShadowRootsController,
      lifeCycle,
      {} as RumConfiguration,
      noop,
      fullSnapshotCallback
    )
  })

  afterEach(() => {
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(fullSnapshotCallback).toHaveBeenCalledTimes(1)
  })

  it('takes a full snapshot when the view changes', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()

    expect(fullSnapshotCallback).toHaveBeenCalledTimes(2)
  })

  it('cancels the previous idle callback when the view changes', () => {
    const { triggerIdleCallbacks, cancelIdleCallbackSpy } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()
    expect(cancelIdleCallbackSpy).toHaveBeenCalledTimes(1)
  })

  it('full snapshot related records should have the view change date', () => {
    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    triggerIdleCallbacks()

    const records = fullSnapshotCallback.calls.mostRecent().args[0]
    expect(records[0].timestamp).toEqual(1)
    expect(records[1].timestamp).toEqual(1)
    expect(records[2].timestamp).toEqual(1)
  })

  it('should use requestAnimationFrame when requestIdleCallback is not defined', () => {
    window.requestIdleCallback = undefined as any
    window.cancelIdleCallback = undefined as any

    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)
    triggerIdleCallbacks()

    expect(fullSnapshotCallback).toHaveBeenCalledTimes(2)
  })
})
