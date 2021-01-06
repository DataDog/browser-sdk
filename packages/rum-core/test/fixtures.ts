import { combine, Context, ErrorSource, ResourceType } from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../src/browser/performanceCollection'
import { ActionType } from '../src/domain/rumEventsCollection/action/trackActions'
import { ViewLoadingType } from '../src/domain/rumEventsCollection/view/trackViews'
import { RawRumEvent, RumEventType } from '../src/rawRumEvent.types'

export function createRawRumEvent(type: RumEventType, overrides?: Context): RawRumEvent {
  switch (type) {
    case RumEventType.ACTION:
      return combine(
        {
          type,
          action: {
            target: {
              name: 'target',
            },
            type: ActionType.CUSTOM,
          },
          date: 0,
        },
        overrides
      )
    case RumEventType.LONG_TASK:
      return combine(
        {
          type,
          date: 0,
          longTask: {
            duration: 0,
          },
        },
        overrides
      )
    case RumEventType.ERROR:
      return combine(
        {
          type,
          date: 0,
          error: {
            message: 'oh snap',
            source: ErrorSource.SOURCE,
          },
        },
        overrides
      )
    case RumEventType.RESOURCE:
      return combine(
        {
          type,
          date: 0,
          resource: {
            duration: 0,
            type: ResourceType.OTHER,
            url: 'http://foo.bar',
          },
        },
        overrides
      )
    case RumEventType.VIEW:
      return combine(
        {
          type,
          _dd: {
            documentVersion: 0,
          },
          date: 0,
          view: {
            action: { count: 0 },
            error: { count: 0 },
            isActive: true,
            loadingType: ViewLoadingType.INITIAL_LOAD,
            longTask: { count: 0 },
            resource: { count: 0 },
            timeSpent: 0,
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
    connectEnd: 200,
    connectStart: 200,
    decodedBodySize: 200,
    domainLookupEnd: 200,
    domainLookupStart: 200,
    duration: 100,
    entryType: 'resource',
    fetchStart: 200,
    name: 'https://resource.com/valid',
    redirectEnd: 200,
    redirectStart: 200,
    requestStart: 200,
    responseEnd: 300,
    responseStart: 200,
    secureConnectionStart: 200,
    startTime: 200,
    ...overrides,
  }
  entry.toJSON = () => entry
  return entry as RumPerformanceResourceTiming & PerformanceResourceTiming
}
