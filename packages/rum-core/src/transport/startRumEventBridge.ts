import type { Context } from '@flashcatcloud/browser-core'
import { getEventBridge } from '@flashcatcloud/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumEvent } from '../rumEvent.types'

export function startRumEventBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<'rum', RumEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    bridge.send('rum', serverRumEvent)
  })
}
