import { combine, Context, ErrorSource, ResourceType } from '@datadog/browser-core'
import { ActionType } from '../src/domain/rumEventsCollection/action/trackActions'
import { ViewLoadingType } from '../src/domain/rumEventsCollection/view/trackViews'
import { RawRumEventV2, RumEventType } from '../src/typesV2'

export function createRawRumEvent(type: RumEventType, overrides?: Context): RawRumEventV2 {
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
