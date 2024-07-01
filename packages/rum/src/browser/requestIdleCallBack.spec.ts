import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import { mockRequestIdleCallback } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../types'
import { addExperimentalFeatures, ExperimentalFeature } from '../../../core/src/tools/experimentalFeatures'
import { createElementsScrollPositions, startFullSnapshots } from '../domain/record'
import type { ShadowRootsController } from '../domain/record'

describe('startFullSnapshots', () => {
  let lifeCycle: LifeCycle
  let fullSnapshotPendingCallback: jasmine.Spy<() => void>
  let fullSnapshotReadyCallback: jasmine.Spy<(records: BrowserRecord[]) => void>
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  const originalRequestIdleCallback = window.requestIdleCallback
  const originalCancelIdleCallback = window.cancelIdleCallback

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    addExperimentalFeatures([ExperimentalFeature.ASYNC_FULL_SNAPSHOT])
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

  it('should use requestAnimationFrame when requestIdleCallback is not defined', () => {
    window.requestIdleCallback = undefined as any
    window.cancelIdleCallback = undefined as any

    const { triggerIdleCallbacks } = mockRequestIdleCallback()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)
    triggerIdleCallbacks()

    expect(fullSnapshotPendingCallback).toHaveBeenCalledTimes(2)
    expect(fullSnapshotReadyCallback).toHaveBeenCalledTimes(2)
  })
})
