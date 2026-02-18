import { describe, expect, it } from 'vitest'
import type { Duration, RelativeTime, ServerDuration } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../test'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle } from '../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('longTaskCollection', () => {
  let lifeCycle: LifeCycle
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function setupLongTaskCollection({
    supportedEntryType,
    trackLongTasks = true,
  }: {
    supportedEntryType?: RumPerformanceEntryType
    trackLongTasks?: boolean
  } = {}) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver({
      supportedEntryTypes: supportedEntryType ? [supportedEntryType] : undefined,
    }))

    lifeCycle = new LifeCycle()
    const longTaskCollection = startLongTaskCollection(lifeCycle, mockRumConfiguration({ trackLongTasks }))

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      longTaskCollection.stop()
    })

    return longTaskCollection
  }

  describe('when browser supports long-animation-frame', () => {
    it('should create a long task event from long animation frame performance entry', () => {
      setupLongTaskCollection()
      const performanceLongAnimationFrameTiming = createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

      notifyPerformanceEntries([performanceLongAnimationFrameTiming])

      expect(rawRumEvents[0].startClocks.relative).toBe(1234 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: expect.any(Number),
        long_task: {
          id: expect.any(String),
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

    it('should only listen to long animation frame performance entry', () => {
      setupLongTaskCollection()

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME),
        createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
      ])

      expect(rawRumEvents.length).toBe(1)
    })

    it('should track long animation frame contexts', () => {
      const longTaskCollection = setupLongTaskCollection()
      const entry = createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)
      notifyPerformanceEntries([entry])

      const longTask = (rawRumEvents[0].rawRumEvent as RawRumLongTaskEvent).long_task
      const longTasks = longTaskCollection.longTaskContexts.findLongTasks(1234 as RelativeTime, 100 as Duration)
      expect(longTasks).toContainEqual({
        id: longTask.id,
        startClocks: expect.objectContaining({ relative: entry.startTime }),
        duration: entry.duration,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      })
    })


    it('should not collect when trackLongTasks=false', () => {
      setupLongTaskCollection({ trackLongTasks: false })

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)])

      expect(rawRumEvents.length).toBe(0)
    })
  })

  describe('when browser only supports legacy longtask', () => {
    it('should create a long task event from long task performance entry', () => {
      setupLongTaskCollection({ supportedEntryType: RumPerformanceEntryType.LONG_TASK })
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

      expect(rawRumEvents[0].startClocks.relative).toBe(1234 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: expect.any(Number),
        long_task: {
          id: expect.any(String),
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
          toJSON: expect.any(Function),
        },
      })
    })

    it('should collect when trackLongTasks=true', () => {
      setupLongTaskCollection({ supportedEntryType: RumPerformanceEntryType.LONG_TASK })

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])
      expect(rawRumEvents.length).toBe(1)
    })

    it('should track long tasks contexts', () => {
      const longTaskCollection = setupLongTaskCollection({ supportedEntryType: RumPerformanceEntryType.LONG_TASK })
      const entry = createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)
      notifyPerformanceEntries([entry])

      const longTask = (rawRumEvents[0].rawRumEvent as RawRumLongTaskEvent).long_task
      const longTasks = longTaskCollection.longTaskContexts.findLongTasks(1234 as RelativeTime, 100 as Duration)
      expect(longTasks).toContainEqual({
        id: longTask.id,
        startClocks: expect.objectContaining({ relative: entry.startTime }),
        duration: entry.duration,
        entryType: RumPerformanceEntryType.LONG_TASK,
      })
    })


    it('should not collect when trackLongTasks=false', () => {
      setupLongTaskCollection({ supportedEntryType: RumPerformanceEntryType.LONG_TASK, trackLongTasks: false })

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

      expect(rawRumEvents.length).toBe(0)
    })
  })
})
