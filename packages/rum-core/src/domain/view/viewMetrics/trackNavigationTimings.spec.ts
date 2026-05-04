import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { relativeNow, type Duration, type RelativeTime } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { mockDocumentReadyState, mockRumConfiguration } from '../../../../test'
import { getNavigationEntry } from '../../../browser/performanceUtils'
import type { NavigationTimings, RelevantNavigationTiming } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'

const FAKE_NAVIGATION_ENTRY: RelevantNavigationTiming = {
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  loadEventEnd: 567 as RelativeTime,
  responseStart: 123 as RelativeTime,
}

const FAKE_INCOMPLETE_NAVIGATION_ENTRY: RelevantNavigationTiming = {
  domComplete: 0 as RelativeTime,
  domContentLoadedEventEnd: 0 as RelativeTime,
  domInteractive: 0 as RelativeTime,
  loadEventEnd: 0 as RelativeTime,
  responseStart: 0 as RelativeTime,
}

describe('trackNavigationTimings', () => {
  let navigationTimingsCallback: Mock<(timings: NavigationTimings) => void>
  let stop: () => void
  let clock: Clock

  beforeEach(() => {
    navigationTimingsCallback = vi.fn()
    clock = mockClock()

    registerCleanupTask(() => {
      stop()
    })
  })

  it('notifies navigation timings after the load event', () => {
    replaceMockable(getNavigationEntry, () => FAKE_NAVIGATION_ENTRY)
    ;({ stop } = trackNavigationTimings(mockRumConfiguration(), navigationTimingsCallback))

    clock.tick(0)

    expect(navigationTimingsCallback).toHaveBeenCalledTimes(1)
    expect(navigationTimingsCallback).toHaveBeenCalledWith({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })

  it('does not report "firstByte" if "responseStart" is negative', () => {
    replaceMockable(getNavigationEntry, () => ({
      ...FAKE_NAVIGATION_ENTRY,
      responseStart: -1 as RelativeTime,
    }))
    ;({ stop } = trackNavigationTimings(mockRumConfiguration(), navigationTimingsCallback))

    clock.tick(0)

    expect(navigationTimingsCallback.mock.lastCall![0].firstByte).toBeUndefined()
  })

  it('does not report "firstByte" if "responseStart" is in the future', () => {
    replaceMockable(getNavigationEntry, () => ({
      ...FAKE_NAVIGATION_ENTRY,
      responseStart: (relativeNow() + 1) as RelativeTime,
    }))
    ;({ stop } = trackNavigationTimings(mockRumConfiguration(), navigationTimingsCallback))

    clock.tick(0)

    expect(navigationTimingsCallback.mock.lastCall![0].firstByte).toBeUndefined()
  })

  it('wait for the load event to provide navigation timing', () => {
    replaceMockable(getNavigationEntry, () => FAKE_NAVIGATION_ENTRY)
    mockDocumentReadyState()
    ;({ stop } = trackNavigationTimings(mockRumConfiguration(), navigationTimingsCallback))

    clock.tick(0)

    expect(navigationTimingsCallback).not.toHaveBeenCalled()
  })

  it('discard incomplete navigation timing', () => {
    replaceMockable(getNavigationEntry, () => FAKE_INCOMPLETE_NAVIGATION_ENTRY)
    ;({ stop } = trackNavigationTimings(mockRumConfiguration(), navigationTimingsCallback))

    clock.tick(0)

    expect(navigationTimingsCallback).not.toHaveBeenCalled()
  })
})
