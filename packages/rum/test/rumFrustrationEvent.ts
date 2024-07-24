import { relativeNow, timeStampNow } from '@datadog/browser-core'
import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, FrustrationType, RumEventType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'

export function createRumFrustrationEvent(mouseEvent: MouseEvent): RawRumEventCollectedData<RawRumActionEvent> {
  return {
    startTime: relativeNow(),
    rawRumEvent: {
      date: timeStampNow(),
      type: RumEventType.ACTION,
      action: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: ActionType.CLICK,
        frustration: {
          type: [FrustrationType.DEAD_CLICK],
        },
        target: {
          name: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
    domainContext: { events: [mouseEvent] },
  }
}
