import { getConnectivity } from '@datadog/browser-core'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'

export function startConnectivityContext(hooks: Hooks) {
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): PartialRumEvent => ({
      type: eventType,
      connectivity: getConnectivity(),
    })
  )
}
