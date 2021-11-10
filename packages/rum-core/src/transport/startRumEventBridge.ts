import { Context, getEventBridge } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { RumEvent } from '../rumEvent.types'

export function startRumEventBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<RumEvent['type'], RumEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    bridge.send(serverRumEvent.type, serverRumEvent)
  })
}
