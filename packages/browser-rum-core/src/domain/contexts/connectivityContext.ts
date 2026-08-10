import { getConnectivity } from '@datadog/browser-core'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'

export function startConnectivityContext(assembleHook: AssembleHook) {
  assembleHook.register(({ eventType }): DefaultRumEventAttributes => ({
    type: eventType,
    connectivity: getConnectivity(),
  }))
}
