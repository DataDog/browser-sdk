import type { Duration } from '@datadog/js-core/time'
import { clocksOrigin } from '@datadog/js-core/time'
import { Observable } from '@datadog/js-core/util'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { MutationRecord } from '@datadog/js-core/dom'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { createMutationRecord, mockGlobalPerformanceBuffer, mockRumConfiguration } from '../../../../test'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { LifeCycle } from '../../lifeCycle'
import { trackCommonViewMetrics } from './trackCommonViewMetrics'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

describe('trackCommonViewMetrics', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let domMutationObservable: Observable<MutationRecord[]>
  let windowOpenObservable: Observable<void>
  let scheduleViewUpdateSpy: jasmine.Spy

  beforeEach(() => {
    mockGlobalPerformanceBuffer()
    clock = mockClock()
    domMutationObservable = new Observable()
    windowOpenObservable = new Observable()
    scheduleViewUpdateSpy = jasmine.createSpy('scheduleViewUpdate')
  })

  it('does not collect loading time from a pending load event after loading time tracking is canceled', () => {
    const { setLoadEvent, cancelLoadingTimeTracking, getCommonViewMetrics, stop } = trackCommonViewMetrics(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      mockRumConfiguration(),
      scheduleViewUpdateSpy,
      ViewLoadingType.INITIAL_LOAD,
      clocksOrigin(),
      false
    )
    registerCleanupTask(stop)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify([createMutationRecord()])
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    cancelLoadingTimeTracking()
    scheduleViewUpdateSpy.calls.reset()
    setLoadEvent(200 as Duration)

    expect(getCommonViewMetrics().loadingTime).toBeUndefined()
    expect(scheduleViewUpdateSpy).not.toHaveBeenCalled()
  })
})
