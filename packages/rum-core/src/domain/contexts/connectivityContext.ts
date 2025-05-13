import { getConnectivity } from '@datadog/browser-core'
import type { Hooks, DefaultRumEventAttributes } from '../../hooks'
import { HookNames } from '../../hooks'

export function startConnectivityContext(hooks: Hooks) {
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      connectivity: getConnectivity(),
    })
  )
}
