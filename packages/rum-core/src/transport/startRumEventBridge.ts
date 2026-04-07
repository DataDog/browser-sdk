import { getEventBridge } from '@datadog/browser-core'
import type { RumEvent } from 'rum-events-format/rum'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'

export function startRumEventBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<'rum', RumEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) => {
    bridge.send('rum', serverRumEvent)
  })
}
