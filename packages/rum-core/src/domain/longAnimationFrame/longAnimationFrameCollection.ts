import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongAnimationFrameEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'

export function startLongAnimationFrameCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType !== RumPerformanceEntryType.LONG_ANIMATION_FRAME) {
        break
      }
      if (!configuration.trackLongTasks) {
        break
      }

      const startClocks = relativeToClocks(entry.startTime)
      const rawRumEvent: RawRumLongAnimationFrameEvent = {
        date: startClocks.timeStamp,
        long_task: {
          id: generateUUID(),
          entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
          duration: toServerDuration(entry.duration),
          blocking_duration: toServerDuration(entry.blockingDuration),
          style_and_layout_start: toServerDuration(entry.styleAndLayoutStart),
          render_start: toServerDuration(entry.renderStart),
          start_time: toServerDuration(entry.startTime),
          first_ui_event_timestamp: entry.firstUIEventTimestamp,
          name: 'long-animation-frame',
          scripts: entry.scripts.map((script) => ({
            duration: toServerDuration(script.duration),
            pause_duration: toServerDuration(script.pauseDuration),
            source_url: script.sourceURL,
            source_function_name: script.sourceFunctionName,
            source_char_position: script.sourceCharPosition,
            start_time: toServerDuration(script.startTime),
            window_attribution: script.windowAttribution,
            forced_style_and_layout_duration: toServerDuration(script.forcedStyleAndLayoutDuration),
            invoker_type: script.invokerType,
            invoker: script.invoker,
            execution_start: toServerDuration(script.executionStart),
          })),
        },
        type: RumEventType.LONG_TASK,
        _dd: {
          discarded: false,
        },
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startTime: startClocks.relative,
        domainContext: { performanceEntry: entry },
      })
    }
  })
}
