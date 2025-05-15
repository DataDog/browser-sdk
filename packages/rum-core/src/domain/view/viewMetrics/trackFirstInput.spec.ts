import { type Duration, type RelativeTime } from '@flashcatcloud/browser-core'
import { registerCleanupTask, restorePageVisibility, setPageVisibility } from '@flashcatcloud/browser-core/test'
import {
  appendElement,
  appendText,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../../test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import { trackFirstHidden } from './trackFirstHidden'

describe('firstInputTimings', () => {
  let fitCallback: jasmine.Spy<(firstInput: FirstInput) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startFirstInputTracking() {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    const configuration = mockRumConfiguration()
    fitCallback = jasmine.createSpy()

    const firstHidden = trackFirstHidden(configuration)
    const firstInputTimings = trackFirstInput(configuration, firstHidden, fitCallback)

    registerCleanupTask(() => {
      firstHidden.stop()
      firstInputTimings.stop()
      restorePageVisibility()
    })
  }

  it('should provide the first input timings', () => {
    startFirstInputTracking()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT)])

    expect(fitCallback).toHaveBeenCalledOnceWith({
      delay: 100 as Duration,
      time: 1000 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should provide the first input target selector', () => {
    startFirstInputTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        target: appendElement('<button id="fid-target-element"></button>'),
      }),
    ])

    expect(fitCallback).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        targetSelector: '#fid-target-element',
      })
    )
  })

  it("should not provide the first input target if it's not a DOM element", () => {
    startFirstInputTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        target: appendText('text'),
      }),
    ])

    expect(fitCallback).toHaveBeenCalledWith(
      jasmine.objectContaining({
        targetSelector: undefined,
      })
    )
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    startFirstInputTracking()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT)])

    expect(fitCallback).not.toHaveBeenCalled()
  })

  it('should be adjusted to 0 if the computed value would be negative due to browser timings imprecisions', () => {
    startFirstInputTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        processingStart: 900 as RelativeTime,
        startTime: 1000 as RelativeTime,
        duration: 0 as Duration,
      }),
    ])

    expect(fitCallback).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        delay: 0,
        time: 1000,
      })
    )
  })
})
