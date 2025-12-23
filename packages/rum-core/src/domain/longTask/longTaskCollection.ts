import type { RelativeTime, ClocksState, Duration } from '@datadog/browser-core'
import {
  toServerDuration,
  relativeToClocks,
  generateUUID,
  createValueHistory,
  SESSION_TIME_OUT_DELAY,
  addDuration,
} from '@datadog/browser-core'
import type { RawRumLongTaskEvent, RawRumLongAnimationFrameEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
  supportPerformanceTimingEvent,
} from '../../browser/performanceObservable'
import type {
  RumPerformanceLongAnimationFrameTiming,
  RumPerformanceLongTaskTiming,
  RumPerformanceScriptTiming,
} from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'

export const LONG_TASK_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface LongTaskContext {
  id: string
  startClocks: ClocksState
  duration: Duration
  entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME | RumPerformanceEntryType.LONG_TASK
}

export interface LongTaskContexts {
  findLongTasks: (startTime: RelativeTime, duration: Duration) => LongTaskContext[]
}

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const history = createValueHistory<LongTaskContext>({
    expireDelay: LONG_TASK_ID_HISTORY_TIME_OUT_DELAY,
  })
  const entryType = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)
    ? RumPerformanceEntryType.LONG_ANIMATION_FRAME
    : RumPerformanceEntryType.LONG_TASK

  const subscription = createPerformanceObservable(configuration, {
    type: entryType,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      if (!configuration.trackLongTasks) {
        break
      }

      const startClocks = relativeToClocks(entry.startTime)
      const taskId = generateUUID()
      const rawRumEvent = processEntry(entry, startClocks, taskId)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startTime: startClocks.relative,
        duration: entry.duration,
        domainContext: { performanceEntry: entry },
      })

      history.add({ id: taskId, startClocks, duration: entry.duration, entryType }, startClocks.relative)
      history.closeActive(addDuration(startClocks.relative, entry.duration))
    }
  })

  const longTaskContexts: LongTaskContexts = {
    findLongTasks: (startTime: RelativeTime, duration: Duration) => history.findAll(startTime, duration),
  }

  return {
    stop: () => {
      subscription.unsubscribe()
      history.stop()
    },
    longTaskContexts,
  }
}

function processEntry(
  entry: RumPerformanceLongTaskTiming | RumPerformanceLongAnimationFrameTiming,
  startClocks: ClocksState,
  taskId: string
): RawRumLongTaskEvent | RawRumLongAnimationFrameEvent {
  const baseEvent = {
    date: startClocks.timeStamp,
    type: RumEventType.LONG_TASK,
    _dd: { discarded: false },
  }

  if (entry.entryType === RumPerformanceEntryType.LONG_TASK) {
    return {
      ...baseEvent,
      long_task: {
        id: taskId,
        entry_type: RumLongTaskEntryType.LONG_TASK,
        duration: toServerDuration(entry.duration),
      },
    }
  }

  return {
    ...baseEvent,
    long_task: {
      id: taskId,
      entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
      duration: toServerDuration(entry.duration),
      blocking_duration: toServerDuration(entry.blockingDuration),
      first_ui_event_timestamp: toServerDuration(entry.firstUIEventTimestamp),
      render_start: toServerDuration(entry.renderStart),
      style_and_layout_start: toServerDuration(entry.styleAndLayoutStart),
      start_time: toServerDuration(entry.startTime),
      scripts: entry.scripts.map((script: RumPerformanceScriptTiming) => ({
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
  }
}
