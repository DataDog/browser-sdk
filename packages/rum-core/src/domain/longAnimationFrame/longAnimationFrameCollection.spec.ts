import { type Context, type TimeStamp, type RelativeTime, type ServerDuration, combine } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockPerformanceObserver, validateRumFormat } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RawRumEvent, RumContext } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import { startLongAnimationFrameCollection } from './longAnimationFrameCollection'

describe('long animation frames collection', () => {
  it('should create raw rum event from long animation frame performance entry', () => {
    const { notifyPerformanceEntries, rawRumEvents } = setupLongAnimationFrameCollection()
    const PerformanceLongAnimationFrameTiming = createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

    notifyPerformanceEntries([PerformanceLongAnimationFrameTiming])

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      long_task: {
        id: jasmine.any(String),
        entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
        duration: (82 * 1e6) as ServerDuration,
        blocking_duration: 0 as ServerDuration,
        first_ui_event_timestamp: 0 as RelativeTime,
        render_start: 1421.5 as RelativeTime,
        style_and_layout_start: 1428 as RelativeTime,
        scripts: [
          {
            duration: (6 * 1e6) as ServerDuration,
            pause_duration: 0 as ServerDuration,
            forced_style_and_layout_duration: 0 as ServerDuration,
            start_time: 1348 as RelativeTime,
            execution_start: 1348.7 as RelativeTime,
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
      performanceEntry: {
        name: 'long-animation-frame',
        duration: 82,
        entryType: 'long-animation-frame',
        startTime: 1234,
        renderStart: 1421.5,
        styleAndLayoutStart: 1428,
        firstUIEventTimestamp: 0,
        blockingDuration: 0,
        scripts: [
          {
            name: 'script',
            entryType: 'script',
            startTime: 1348,
            duration: 6,
            invoker: 'http://example.com/script.js',
            invokerType: 'classic-script',
            windowAttribution: 'self',
            executionStart: 1348.7,
            forcedStyleAndLayoutDuration: 0,
            pauseDuration: 0,
            sourceURL: 'http://example.com/script.js',
            sourceFunctionName: '',
            sourceCharPosition: 9876,
          },
        ],
        toJSON: jasmine.any(Function),
      },
    })
  })
})

function setupLongAnimationFrameCollection() {
  const lifeCycle = new LifeCycle()
  const configuration = {} as RumConfiguration

  const notifyPerformanceEntries = mockPerformanceObserver().notifyPerformanceEntries
  const rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(lifeCycle, configuration)

  registerCleanupTask(() => {
    stopLongAnimationFrameCollection()
  })

  return {
    notifyPerformanceEntries,
    rawRumEvents,
  }
}

// TODO: replace with packages/rum-core/test/eventFormatValidation.ts from this PR https://github.com/DataDog/browser-sdk/pull/2913
function collectAndValidateRawRumEvents(lifeCycle: LifeCycle) {
  const rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    rawRumEvents.push(data)
    validateRumEventFormat(data.rawRumEvent)
  })
  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return rawRumEvents
}

function validateRumEventFormat(rawRumEvent: RawRumEvent) {
  const fakeId = '00000000-aaaa-0000-aaaa-000000000000'
  const fakeContext: RumContext = {
    _dd: {
      format_version: 2,
      drift: 0,
      configuration: {
        session_sample_rate: 40,
        session_replay_sample_rate: 60,
      },
    },
    application: {
      id: fakeId,
    },
    date: 0 as TimeStamp,
    source: 'browser',
    session: {
      id: fakeId,
      type: 'user',
    },
    view: {
      id: fakeId,
      referrer: '',
      url: 'fake url',
    },
    connectivity: {
      status: 'connected',
      interfaces: ['wifi'],
      effective_type: '4g',
    },
  }
  validateRumFormat(combine(fakeContext as RumContext & Context, rawRumEvent))
}
