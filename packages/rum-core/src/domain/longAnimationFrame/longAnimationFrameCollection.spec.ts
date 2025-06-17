import { type RelativeTime, type ServerDuration } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import { LifeCycle } from '../lifeCycle'
import { startLongAnimationFrameCollection } from './longAnimationFrameCollection'

describe('long animation frames collection', () => {
  it('should create raw rum event from long animation frame performance entry', () => {
    const { notifyPerformanceEntries, rawRumEvents } = setupLongAnimationFrameCollection()
    const performanceLongAnimationFrameTiming = createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

    notifyPerformanceEntries([performanceLongAnimationFrameTiming])

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      long_task: {
        id: jasmine.any(String),
        entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
        duration: (82 * 1e6) as ServerDuration,
        blocking_duration: 0 as ServerDuration,
        first_ui_event_timestamp: 0 as ServerDuration,
        render_start: 1_421_500_000 as ServerDuration,
        style_and_layout_start: 1_428_000_000 as ServerDuration,
        start_time: 1_234_000_000 as ServerDuration,
        scripts: [
          {
            duration: (6 * 1e6) as ServerDuration,
            pause_duration: 0 as ServerDuration,
            forced_style_and_layout_duration: 0 as ServerDuration,
            start_time: 1_348_000_000 as ServerDuration,
            execution_start: 1_348_700_000 as ServerDuration,
            source_url: 'http://example.com/script.js',
            source_function_name: '',
            source_char_position: 9876,
            invoker: 'http://example.com/script.js',
            invoker_type: 'classic-script',
            window_attribution: 'self',
          },
        ],
      },
      type: RumEventType.LONG_TASK,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry: performanceLongAnimationFrameTiming,
    })
  })
})

function setupLongAnimationFrameCollection() {
  const lifeCycle = new LifeCycle()

  const notifyPerformanceEntries = mockPerformanceObserver().notifyPerformanceEntries
  const rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(
    lifeCycle,
    mockRumConfiguration()
  )

  registerCleanupTask(() => {
    stopLongAnimationFrameCollection()
  })

  return {
    notifyPerformanceEntries,
    rawRumEvents,
  }
}
