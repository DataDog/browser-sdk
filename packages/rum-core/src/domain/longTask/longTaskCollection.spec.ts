import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../test'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../../browser/performanceObservable'
import type { RawRumEvent, RawRumLongTaskEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle } from '../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('longTaskCollection', () => {
  let lifeCycle: LifeCycle
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function setupLongTaskCollection(trackLongTasks = true) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    lifeCycle = new LifeCycle()
    const longTaskCollection = startLongTaskCollection(lifeCycle, mockRumConfiguration({ trackLongTasks }))

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      longTaskCollection.stop()
    })

    return longTaskCollection
  }

  describe('when browser supports long-animation-frame', () => {
    beforeEach(() => {
      if (!supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)) {
        pending('Browser does not support long-animation-frame')
      }
    })

    it('should create raw rum event from long animation frame performance entry', () => {
      setupLongTaskCollection()
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

    it('should track long animation frame IDs in history', () => {
      const longTaskCollection = setupLongTaskCollection()
      const performanceLongAnimationFrameTiming = createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

      notifyPerformanceEntries([performanceLongAnimationFrameTiming])

      const longTaskId = (rawRumEvents[0].rawRumEvent as RawRumLongTaskEvent).long_task.id
      expect(longTaskCollection.longTaskContexts.findLongTaskId(1234 as RelativeTime)).toBe(longTaskId)
    })
  })

  describe('when browser only supports legacy longtask', () => {
    beforeEach(() => {
      if (supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)) {
        pending('Browser supports long-animation-frame, skip legacy tests')
      }
    })

    it('should only listen to long task performance entry', () => {
      setupLongTaskCollection()

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
        createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
        createPerformanceEntry(RumPerformanceEntryType.PAINT),
      ])

      expect(rawRumEvents.length).toBe(1)
    })

    it('should collect when trackLongTasks=true', () => {
      setupLongTaskCollection()

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])
      expect(rawRumEvents.length).toBe(1)
    })

    it('should create raw rum event from legacy long task performance entry', () => {
      setupLongTaskCollection()
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

      expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        long_task: {
          id: jasmine.any(String),
          entry_type: RumLongTaskEntryType.LONG_TASK,
          duration: (100 * 1e6) as ServerDuration,
        },
        type: RumEventType.LONG_TASK,
        _dd: {
          discarded: false,
        },
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        performanceEntry: {
          name: 'self',
          duration: 100,
          entryType: 'longtask',
          startTime: 1234,
          toJSON: jasmine.any(Function),
        },
      })
    })

    it('should track legacy long task IDs in history', () => {
      const longTaskCollection = setupLongTaskCollection()

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

      const longTaskId = (rawRumEvents[0].rawRumEvent as RawRumLongTaskEvent).long_task.id
      expect(longTaskCollection.longTaskContexts.findLongTaskId(1234 as RelativeTime)).toBe(longTaskId)
    })
  })

  describe('common behavior', () => {
    it('should not collect when trackLongTasks=false', () => {
      setupLongTaskCollection(false)

      const entryType = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)
        ? RumPerformanceEntryType.LONG_ANIMATION_FRAME
        : RumPerformanceEntryType.LONG_TASK

      notifyPerformanceEntries([createPerformanceEntry(entryType)])

      expect(rawRumEvents.length).toBe(0)
    })

    it('should stop collection and cleanup history', () => {
      const longTaskCollection = setupLongTaskCollection()

      const entryType = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)
        ? RumPerformanceEntryType.LONG_ANIMATION_FRAME
        : RumPerformanceEntryType.LONG_TASK

      notifyPerformanceEntries([createPerformanceEntry(entryType)])
      const longTaskId = (rawRumEvents[0].rawRumEvent as RawRumLongTaskEvent).long_task.id

      expect(longTaskCollection.longTaskContexts.findLongTaskId(1234 as RelativeTime)).toBe(longTaskId)

      longTaskCollection.stop()

      // After stop, should not collect new entries
      notifyPerformanceEntries([createPerformanceEntry(entryType)])
      expect(rawRumEvents.length).toBe(1) // Still just the first one
    })
  })
})
