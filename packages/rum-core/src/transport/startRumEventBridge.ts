import { Context, getEventBridge, InitConfiguration } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { RumEvent } from '../rumEvent.types'

export function startRumEventBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    bridge.send(serverRumEvent.type, serverRumEvent)
  })
}

export function overrideInitConfigurationForBridge<C extends InitConfiguration>(initConfiguration: C): C {
  return { ...initConfiguration, applicationId: 'empty', clientToken: 'empty', sampleRate: 100 }
}
