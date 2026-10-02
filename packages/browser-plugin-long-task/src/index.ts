// SPIKE: feasibility exploration for "core features as plugins". Ports the built-in
// longTaskCollection logic (packages/browser-rum-core/src/domain/longTask/longTaskCollection.ts)
// behind the public RumPlugin contract instead of the internal LifeCycle/Hooks wiring.
//
// Not intended to ship as-is. See the "Early investigation" / spike doc for context.

import { buildDebugIdByUrl, generateUUID } from '@datadog/browser-core'
import { relativeToClocks, toServerDuration } from '@datadog/js-core/time'
import type { RelativeTime } from '@datadog/js-core/time'
import type {
  AllowedRawRumEvent,
  OnRumStartOptions,
  RumPerformanceLongAnimationFrameTiming,
  RumPerformanceLongTaskTiming,
  RumPerformanceScriptTiming,
  RumPlugin,
  RumPluginOnInitOptions,
} from '@datadog/browser-rum-core'
import {
  RumEventType,
  RumLongTaskEntryType,
  RumPerformanceEntryType,
  createPerformanceObservable,
  supportPerformanceTimingEvent,
} from '@datadog/browser-rum-core'

/**
 * Creates the long task plugin (spike).
 *
 * Register on `DD_RUM.init({ plugins: [longTaskPlugin()] })`. Mirrors the default-on behavior of
 * `trackLongTasks` (on unless explicitly set to `false`), but does NOT know about remote
 * configuration overrides of `trackLongTasks`. `onInit` fires before remote config is resolved,
 * a pre-existing limitation of the plugin system, not specific to this spike.
 *
 * @experimental spike only
 */
type AddEvent = NonNullable<OnRumStartOptions['addEvent']>

export function longTaskPlugin(): RumPlugin {
  let addEvent: AddEvent | undefined
  const pendingSubmits: Array<() => void> = []

  function submitOrQueue(startTime: RelativeTime, event: AllowedRawRumEvent, domainContext: Parameters<AddEvent>[2]) {
    const submit = () => addEvent!(startTime, event, domainContext)
    if (addEvent) {
      submit()
    } else {
      pendingSubmits.push(submit)
    }
  }

  return {
    name: 'long-task',

    onInit(options: RumPluginOnInitOptions) {
      if (options.initConfiguration.trackLongTasks === false) {
        return
      }

      const entryType = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)
        ? RumPerformanceEntryType.LONG_ANIMATION_FRAME
        : RumPerformanceEntryType.LONG_TASK

      createPerformanceObservable({ type: entryType, buffered: true }).subscribe((entries) => {
        for (const entry of entries) {
          const startClocks = relativeToClocks(entry.startTime)
          const event = processEntry(entry, startClocks)
          submitOrQueue(entry.startTime, event, { performanceEntry: entry })
        }
      })
    },

    onRumStart(options: OnRumStartOptions) {
      addEvent = options.addEvent
      pendingSubmits.forEach((submit) => submit())
      pendingSubmits.length = 0
    },
  }
}

function processEntry(
  entry: RumPerformanceLongTaskTiming | RumPerformanceLongAnimationFrameTiming,
  startClocks: ReturnType<typeof relativeToClocks>
): AllowedRawRumEvent {
  const id = generateUUID()
  const duration = toServerDuration(entry.duration)

  const baseEvent = {
    date: startClocks.timeStamp,
    type: RumEventType.LONG_TASK,
    _dd: { discarded: false },
  }

  if (entry.entryType === RumPerformanceEntryType.LONG_TASK) {
    return {
      ...baseEvent,
      long_task: {
        id,
        entry_type: RumLongTaskEntryType.LONG_TASK,
        duration,
      },
    }
  }

  const scriptUrls = entry.scripts.map((script) => script.sourceURL).filter((url): url is string => !!url)
  const debugIdByUrl = buildDebugIdByUrl(scriptUrls)

  return {
    ...baseEvent,
    _dd: { discarded: false, debug_ids: debugIdByUrl },
    long_task: {
      id,
      entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
      duration,
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
