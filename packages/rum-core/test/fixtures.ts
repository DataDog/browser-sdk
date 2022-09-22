import type { Context, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { combine, ErrorHandling, ErrorSource, generateUUID, ResourceType } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../src/browser/performanceCollection'
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
          },
        },
        overrides
      )
  }
}

export function createResourceEntry(
  overrides?: Partial<RumPerformanceResourceTiming>
): RumPerformanceResourceTiming & PerformanceResourceTiming {
  const entry: Partial<RumPerformanceResourceTiming & PerformanceResourceTiming> = {
    connectEnd: 200 as RelativeTime,
    connectStart: 200 as RelativeTime,
    decodedBodySize: 200,
    domainLookupEnd: 200 as RelativeTime,
    domainLookupStart: 200 as RelativeTime,
    duration: 100 as Duration,
    entryType: 'resource',
    fetchStart: 200 as RelativeTime,
    name: 'https://resource.com/valid',
    redirectEnd: 200 as RelativeTime,
    redirectStart: 200 as RelativeTime,
    requestStart: 200 as RelativeTime,
    responseEnd: 300 as RelativeTime,
    responseStart: 200 as RelativeTime,
    secureConnectionStart: 200 as RelativeTime,
    startTime: 200 as RelativeTime,
    ...overrides,
  }
  entry.toJSON = () => entry
  return entry as RumPerformanceResourceTiming & PerformanceResourceTiming
}
