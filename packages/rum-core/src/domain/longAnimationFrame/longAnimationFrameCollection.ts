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
          first_ui_event_timestamp: relativeToClocks(entry.firstUIEventTimestamp).relative,
          render_start: relativeToClocks(entry.renderStart).relative,
          style_and_layout_start: relativeToClocks(entry.styleAndLayoutStart).relative,
          scripts: entry.scripts.map((script) => ({
            duration: toServerDuration(script.duration),
            pause_duration: toServerDuration(script.pauseDuration),
            forced_style_and_layout_duration: toServerDuration(script.forcedStyleAndLayoutDuration),
            start_time: relativeToClocks(script.startTime).relative,
            execution_start: relativeToClocks(script.executionStart).relative,
            source_url: script.sourceURL,
            source_function_name: script.sourceFunctionName,
            source_char_position: script.sourceCharPosition,
            invoker: script.invoker,
            invoker_type: script.invokerType,
            window_attribution: script.windowAttribution,
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
