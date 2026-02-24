import { getConnectivity, HookNames } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export function connectivityDecoratorFactory(): DecoratorFactory<Observation, { connectivity: ReturnType<typeof getConnectivity> }> {
  return {
    name: 'connectivity',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) =>
        Promise.resolve({
          status: 'contributed' as const,
          attributes: { connectivity: getConnectivity() },
        }),
    }),
  }
}

export function startConnectivityContext(hooks: Hooks) {
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      connectivity: getConnectivity(),
    })
  )
}
