import type { Duration } from '@datadog/browser-core'
import { clocksOrigin, Observable } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { createMutationRecord, mockGlobalPerformanceBuffer, mockRumConfiguration } from '../../../../test'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { LifeCycle } from '../../lifeCycle'
import type { RumMutationRecord } from '../../../browser/domMutationObservable'
import { trackCommonViewMetrics } from './trackCommonViewMetrics'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

describe('trackCommonViewMetrics', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let domMutationObservable: Observable<RumMutationRecord[]>
  let windowOpenObservable: Observable<void>
  let scheduleViewUpdateSpy: jasmine.Spy

  beforeEach(() => {
    mockGlobalPerformanceBuffer()
    clock = mockClock()
    domMutationObservable = new Observable()
    windowOpenObservable = new Observable()
    scheduleViewUpdateSpy = jasmine.createSpy('scheduleViewUpdate')
  })

  describe('manual loading time suppresses auto-detected loading time callback', () => {
    it('should ignore auto-detected loading time when manual loading time was already set', () => {
      const { setLoadEvent, setManualLoadingTime, getCommonViewMetrics, stop } = trackCommonViewMetrics(
        lifeCycle,
        domMutationObservable,
        windowOpenObservable,
        mockRumConfiguration(),
        scheduleViewUpdateSpy,
        ViewLoadingType.INITIAL_LOAD,
        clocksOrigin()
      )

      registerCleanupTask(stop)

      // Step 1: Trigger page activity and let it end.
      // This sets isWaitingForActivityLoadingTime = false with a candidate,
      // but isWaitingForLoadEvent is still true so the callback does not fire yet.
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      domMutationObservable.notify([createMutationRecord()])
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

      // Step 2: Set manual loading time. This sets hasManualLoadingTime = true
      // and calls stopLoadingTimeTracking (waitPageActivityEnd already completed).
      const manualLoadingTime = 500 as Duration
      setManualLoadingTime(manualLoadingTime)

      expect(getCommonViewMetrics().loadingTime).toBe(manualLoadingTime)

      // Step 3: Fire setLoadEvent, which completes the remaining wait condition.
      // trackLoadingTime's invokeCallbackIfAllCandidatesAreReceived will now fire
      // the loading time callback. The hasManualLoadingTime guard should prevent
      // the auto-detected value from overwriting the manual one.
      setLoadEvent(200 as Duration)

      // Verify the manual value was preserved (not overwritten by auto-detection)
      expect(getCommonViewMetrics().loadingTime).toBe(manualLoadingTime)
    })
  })
})
