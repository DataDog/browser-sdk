import type { Context } from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'

export function mapStreamToView(serverRumEvent: RumEvent & Context): RumEvent & Context {
  const streamEvent = {
    ...(serverRumEvent as RumViewEvent),
    _dd: {
      ...serverRumEvent._dd,
      document_version: serverRumEvent.stream?.document_version,
    },
    stream: {
      ...serverRumEvent.stream,
      time_spent: undefined,
    },
    view: {
      ...serverRumEvent.view,
      id: serverRumEvent.stream?.id,
      action: {
        count: 0,
      },
      error: {
        count: 0,
      },
      resource: {
        count: 0,
      },
      time_spent: serverRumEvent.stream?.time_spent,
    },
    type: RumEventType.VIEW,
  }

  return streamEvent as RumEvent & Context
}
