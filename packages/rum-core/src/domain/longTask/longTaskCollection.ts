import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import type { RumPerformanceScriptTiming } from '../../browser/performanceCollection'
import type { RumConfiguration } from '../configuration'

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (
        // entry.entryType !== RumPerformanceEntryType.LONG_TASK &&
        entry.entryType !== RumPerformanceEntryType.LONG_ANIMATION_FRAME
      ) {
        break
      }
      if (!configuration.trackLongTasks) {
        break
      }
      const startClocks = relativeToClocks(entry.startTime)
      let longTaskData = {
        id: generateUUID(),
        duration: toServerDuration(entry.duration),
      }

      if (entry.entryType === RumPerformanceEntryType.LONG_ANIMATION_FRAME) {
        const { blockingDuration, firstUIEventTimestamp, renderStart, startTime, styleAndLayoutStart } = entry

        const enrichedScriptsPromises = entry.scripts.map((script) => {
          const {
            name,
            duration,
            entryType,
            executionStart,
            forcedStyleAndLayoutDuration,
            invoker,
            invokerType,
            pauseDuration,
            sourceCharPosition,
            sourceFunctionName,
            sourceURL,
            startTime,
            windowAttribution,
          } = script.toJSON() as RumPerformanceScriptTiming

          return fetch(sourceURL, { cache: 'force-cache' })
            .then((response) => response.text())
            .then((sourceContent) => {
              let totalCharCount = 0
              let currentLine = 1
              let currentCol = 1

              for (let i = 0; i < sourceContent.length; i++) {
                if (sourceContent[i] === '\n') {
                  currentLine++
                  currentCol = 1
                } else {
                  currentCol++
                }
                totalCharCount++

                if (totalCharCount === sourceCharPosition) {
                  break
                }
              }

              return {
                name,
                duration: toServerDuration(duration),
                entryType,
                executionStart,
                forcedStyleAndLayoutDuration: toServerDuration(forcedStyleAndLayoutDuration),
                invoker,
                invokerType,
                pauseDuration: toServerDuration(pauseDuration),
                sourceCharPosition,
                sourceFunctionName,
                sourceURL,
                sourceLine: currentLine,
                sourceCol: currentCol,
                startTime,
                windowAttribution,
              }
            })
        })

        // longTaskData = Object.assign(longTaskData, {
        //   blockingDuration: toServerDuration(blockingDuration),
        //   firstUIEventTimestamp,
        //   renderStart,
        //   startTime,
        //   styleAndLayoutStart,
        //   scripts: enrichedScripts,
        // })
        Promise.all(enrichedScriptsPromises)
          .then((enrichedScripts) => {
            longTaskData = Object.assign(longTaskData, {
              blockingDuration: toServerDuration(blockingDuration),
              firstUIEventTimestamp,
              renderStart,
              startTime,
              styleAndLayoutStart,
              scripts: enrichedScripts,
            })
            const rawRumEvent: RawRumLongTaskEvent = {
              date: startClocks.timeStamp,
              long_task: longTaskData,
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
          })
          .catch(() => {})
      } else {
        const rawRumEvent: RawRumLongTaskEvent = {
          date: startClocks.timeStamp,
          long_task: longTaskData,
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
    }
  })
}
