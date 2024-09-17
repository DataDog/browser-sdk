import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongAnimationFrameEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'

export function startLongAnimationFrameCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const performanceResourceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      const startClocks = relativeToClocks(entry.startTime)

      const rawRumEvent: RawRumLongAnimationFrameEvent = {
        date: startClocks.timeStamp,
        long_task: {
          id: generateUUID(),
          entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
          duration: toServerDuration(entry.duration),
          blocking_duration: toServerDuration(entry.blockingDuration),
          first_ui_event_timestamp: toServerDuration(entry.firstUIEventTimestamp),
          render_start: toServerDuration(entry.renderStart),
          style_and_layout_start: toServerDuration(entry.styleAndLayoutStart),
          scripts: entry.scripts.map((script) => ({
            duration: toServerDuration(script.duration),
            pause_duration: toServerDuration(script.pauseDuration),
            forced_style_and_layout_duration: toServerDuration(script.forcedStyleAndLayoutDuration),
            start_time: toServerDuration(script.startTime),
            execution_start: toServerDuration(script.executionStart),
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

  return {
    stop: () => performanceResourceSubscription.unsubscribe(),
  }
}
