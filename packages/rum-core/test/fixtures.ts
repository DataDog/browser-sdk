import type { Context, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import {
  assign,
  combine,
  ErrorHandling,
  ErrorSource,
  generateUUID,
  relativeNow,
  ResourceType,
} from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../src/browser/performanceCollection'
import type {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumLayoutShiftTiming,
  RumPerformanceEventTiming,
  RumPerformanceLongTaskTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
  RumPerformanceResourceTiming,
} from '../src/browser/performanceCollection'
import type { RawRumEvent } from '../src/rawRumEvent.types'
import { ActionType, RumEventType, ViewLoadingType } from '../src/rawRumEvent.types'

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
    case RumEventType.LONG_TASK:
      return combine(
        {
          type,
          date: 0 as TimeStamp,
          long_task: {
            id: generateUUID(),
            duration: 0 as ServerDuration,
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

type EntryTypeToReturnType = {
  [RumPerformanceEntryType.EVENT]: RumPerformanceEventTiming
  [RumPerformanceEntryType.FIRST_INPUT]: RumFirstInputTiming
  [RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT]: RumLargestContentfulPaintTiming
  [RumPerformanceEntryType.LAYOUT_SHIFT]: RumLayoutShiftTiming
  [RumPerformanceEntryType.PAINT]: RumPerformancePaintTiming
  [RumPerformanceEntryType.LONG_TASK]: RumPerformanceLongTaskTiming
  [RumPerformanceEntryType.NAVIGATION]: RumPerformanceNavigationTiming
  [RumPerformanceEntryType.RESOURCE]: RumPerformanceResourceTiming
}

export function createPerformanceEntry<T extends RumPerformanceEntryType>(
  entryType: T,
  overrides?: Partial<EntryTypeToReturnType[T]>
): EntryTypeToReturnType[T] {
  switch (entryType) {
    case RumPerformanceEntryType.EVENT:
      return assign(
        {
          entryType: RumPerformanceEntryType.EVENT,
          processingStart: relativeNow(),
          startTime: relativeNow(),
          duration: 40 as Duration,
        },
        overrides
      ) as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.FIRST_INPUT:
      return assign(
        {
          entryType: RumPerformanceEntryType.FIRST_INPUT,
          processingStart: 1100 as RelativeTime,
          startTime: 1000 as RelativeTime,
          duration: 40 as Duration,
        },
        overrides
      ) as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT: {
      const entry = assign(
        {
          entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
          startTime: 789 as RelativeTime,
          size: 10,
        },
        overrides
      ) as EntryTypeToReturnType[T]
      return { ...entry, toJSON: () => entry }
    }
    case RumPerformanceEntryType.LAYOUT_SHIFT:
      return assign(
        {
          entryType: RumPerformanceEntryType.LAYOUT_SHIFT,
          startTime: relativeNow(),
          hadRecentInput: false,
          value: 0.1,
        },
        overrides
      ) as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.PAINT:
      return assign(
        {
          entryType: RumPerformanceEntryType.PAINT,
          name: 'first-contentful-paint',
          startTime: 123 as RelativeTime,
        },
        overrides
      ) as EntryTypeToReturnType[T]
    case RumPerformanceEntryType.NAVIGATION:
      return assign(
        {
          entryType: RumPerformanceEntryType.NAVIGATION,
          responseStart: 123 as RelativeTime,
          domComplete: 456 as RelativeTime,
          domContentLoadedEventEnd: 345 as RelativeTime,
          domInteractive: 234 as RelativeTime,
          loadEventEnd: 567 as RelativeTime,
        },
        overrides
      ) as EntryTypeToReturnType[T]

    case RumPerformanceEntryType.LONG_TASK: {
      const entry = assign(
        {
          name: 'self',
          duration: 100 as Duration,
          entryType: RumPerformanceEntryType.LONG_TASK,
          startTime: 1234 as RelativeTime,
        },
        overrides
      ) as EntryTypeToReturnType[T]

      return { ...entry, toJSON: () => entry }
    }
    case RumPerformanceEntryType.RESOURCE: {
      const entry = assign(
        {
          connectEnd: 200 as RelativeTime,
          connectStart: 200 as RelativeTime,
          decodedBodySize: 200,
          domainLookupEnd: 200 as RelativeTime,
          domainLookupStart: 200 as RelativeTime,
          duration: 100 as Duration,
          entryType: RumPerformanceEntryType.RESOURCE,
          fetchStart: 200 as RelativeTime,
          name: 'https://resource.com/valid',
          redirectEnd: 200 as RelativeTime,
          redirectStart: 200 as RelativeTime,
          requestStart: 200 as RelativeTime,
          responseEnd: 300 as RelativeTime,
          responseStart: 200 as RelativeTime,
          secureConnectionStart: 200 as RelativeTime,
          startTime: 200 as RelativeTime,
        },
        overrides
      ) as EntryTypeToReturnType[T]

      return { ...entry, toJSON: () => entry }
    }
    default:
      throw new Error(`Unsupported entryType fixture: ${entryType}`)
  }
}
