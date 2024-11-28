import type { Context, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { combine, ErrorHandling, ErrorSource, generateUUID, relativeNow, ResourceType } from '@datadog/browser-core'
import { RumPerformanceEntryType, type EntryTypeToReturnType } from '../src/browser/performanceObservable'
import type { RawRumEvent } from '../src/rawRumEvent.types'
import { VitalType, ActionType, RumEventType, ViewLoadingType, RumLongTaskEntryType } from '../src/rawRumEvent.types'

export function createRawRumEvent(type: RumEventType, overrides?: Context): RawRumEvent {
  switch (type) {
    case RumEventType.ACTION:
      return combine(
        {
          type,
          action: {
            id: generateUUID(),
            target: {
              name: 'target',
            },
            type: ActionType.CUSTOM,
          },
          date: 0 as TimeStamp,
        },
        overrides
      )
    case RumEventType.VITAL:
      return combine(
        {
          type,
          date: 0 as TimeStamp,
          vital: {
            id: generateUUID(),
            type: VitalType.DURATION,
            name: 'timing',
            duration: 0 as ServerDuration,
          },
        },
        overrides
      )
    case RumEventType.LONG_TASK:
      return combine(
        {
          type,
          date: 0 as TimeStamp,
          long_task: {
            id: generateUUID(),
            duration: 0 as ServerDuration,
            entry_type: RumLongTaskEntryType.LONG_TASK,
          },
          _dd: {
            discarded: false,
          },
        },
        overrides
      )
    case RumEventType.ERROR:
      return combine(
        {
          type,
          date: 0 as TimeStamp,
          error: {
            id: generateUUID(),
            message: 'oh snap',
            source: ErrorSource.SOURCE,
            handling: ErrorHandling.HANDLED,
            source_type: 'browser',
            causes: [],
          },
        },
        overrides
      )
    case RumEventType.RESOURCE:
      return combine(
        {
          type,
          date: 0 as TimeStamp,
          resource: {
            id: generateUUID(),
            duration: 0 as ServerDuration,
            type: ResourceType.OTHER,
            url: 'http://foo.bar',
          },
          _dd: {
            discarded: false,
          },
        },
        overrides
      )
    case RumEventType.VIEW:
      return combine(
        {
          type,
          _dd: {
            document_version: 0,
            configuration: {
              start_session_replay_recording_manually: false,
            },
          },
          date: 0 as TimeStamp,
          view: {
            id: generateUUID(),
            action: { count: 0 },
            frustration: { count: 0 },
            error: { count: 0 },
            is_active: true,
            loading_type: ViewLoadingType.INITIAL_LOAD,
            long_task: { count: 0 },
            resource: { count: 0 },
            time_spent: 0 as ServerDuration,
          },
          session: {
            has_replay: undefined,
            is_active: undefined,
          },
        },
        overrides
      )
  }
}

export function createPerformanceEntry<T extends RumPerformanceEntryType>(
  entryType: T,
  overrides?: Partial<EntryTypeToReturnType[T]>
): EntryTypeToReturnType[T] {
  switch (entryType) {
    case RumPerformanceEntryType.EVENT:
      return {
        entryType: RumPerformanceEntryType.EVENT,
        processingStart: relativeNow(),
        startTime: relativeNow(),
        duration: 40 as Duration,
        ...overrides,
      } as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.FIRST_INPUT:
      return {
        entryType: RumPerformanceEntryType.FIRST_INPUT,
        processingStart: 1100 as RelativeTime,
        startTime: 1000 as RelativeTime,
        duration: 40 as Duration,
        ...overrides,
      } as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT: {
      const entry = {
        entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
        startTime: 789 as RelativeTime,
        size: 10,
        ...overrides,
      } as EntryTypeToReturnType[T]
      return { ...entry, toJSON: () => entry }
    }
    case RumPerformanceEntryType.LAYOUT_SHIFT:
      return {
        entryType: RumPerformanceEntryType.LAYOUT_SHIFT,
        startTime: relativeNow(),
        hadRecentInput: false,
        value: 0.1,
        ...overrides,
      } as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.PAINT:
      return {
        entryType: RumPerformanceEntryType.PAINT,
        name: 'first-contentful-paint',
        startTime: 123 as RelativeTime,
        ...overrides,
      } as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.NAVIGATION:
      return {
        entryType: RumPerformanceEntryType.NAVIGATION,
        responseStart: 123 as RelativeTime,
        domComplete: 456 as RelativeTime,
        domContentLoadedEventEnd: 345 as RelativeTime,
        domInteractive: 234 as RelativeTime,
        loadEventEnd: 567 as RelativeTime,
        ...overrides,
      } as EntryTypeToReturnType[T]

    case RumPerformanceEntryType.LONG_TASK: {
      const entry = {
        name: 'self',
        duration: 100 as Duration,
        entryType: RumPerformanceEntryType.LONG_TASK,
        startTime: 1234 as RelativeTime,
        ...overrides,
      } as EntryTypeToReturnType[T]

      return { ...entry, toJSON: () => entry }
    }
    case RumPerformanceEntryType.LONG_ANIMATION_FRAME: {
      const entry = {
        name: 'long-animation-frame',
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
        startTime: 1234 as RelativeTime,
        duration: 82 as Duration,
        renderStart: 1421.5 as RelativeTime,
        styleAndLayoutStart: 1428 as RelativeTime,
        firstUIEventTimestamp: 0 as RelativeTime,
        blockingDuration: 0 as Duration,
        scripts: [
          {
            name: 'script',
            entryType: 'script',
            startTime: 1348 as RelativeTime,
            duration: 6 as Duration,
            invoker: 'http://example.com/script.js',
            invokerType: 'classic-script',
            windowAttribution: 'self',
            executionStart: 1348.7 as RelativeTime,
            forcedStyleAndLayoutDuration: 0 as Duration,
            pauseDuration: 0 as Duration,
            sourceURL: 'http://example.com/script.js',
            sourceFunctionName: '',
            sourceCharPosition: 9876,
          },
        ],
        ...overrides,
      } as EntryTypeToReturnType[T]

      return { ...entry, toJSON: () => entry }
    }
    case RumPerformanceEntryType.RESOURCE: {
      const entry = {
        connectEnd: 200 as RelativeTime,
        connectStart: 200 as RelativeTime,
        renderBlockingStatus: 'non-blocking',
        deliveryType: 'cache',
        domainLookupEnd: 200 as RelativeTime,
        domainLookupStart: 200 as RelativeTime,
        duration: 100 as Duration,
        entryType: RumPerformanceEntryType.RESOURCE,
        workerStart: 200 as RelativeTime,
        fetchStart: 200 as RelativeTime,
        name: 'https://resource.com/valid',
        redirectEnd: 200 as RelativeTime,
        redirectStart: 200 as RelativeTime,
        requestStart: 200 as RelativeTime,
        responseEnd: 300 as RelativeTime,
        responseStart: 200 as RelativeTime,
        secureConnectionStart: 200 as RelativeTime,
        startTime: 200 as RelativeTime,
        responseStatus: 200,
        nextHopProtocol: 'HTTP/1.0',
        ...overrides,
      } as EntryTypeToReturnType[T]

      return { ...entry, toJSON: () => entry }
    }
    default:
      throw new Error(`Unsupported entryType fixture: ${entryType}`)
  }
}