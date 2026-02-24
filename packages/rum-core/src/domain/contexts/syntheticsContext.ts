import {
  SKIPPED,
  getSyntheticsContext,
  HookNames,
  willSyntheticsInjectRum,
  isSyntheticsTest,
} from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export function syntheticsDecoratorFactory(): DecoratorFactory<
  Observation,
  { synthetics?: { testId: string | undefined; resultId: string | undefined; injected: boolean | undefined } }
> {
  return {
    name: 'synthetics',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) => {
        if (!isSyntheticsTest()) {
          return Promise.resolve({ status: 'skipped' as const })
        }
        return Promise.resolve({
          status: 'contributed' as const,
          attributes: {
            synthetics: {
              testId: getSyntheticsTestId(),
              resultId: getSyntheticsResultId(),
              injected: willSyntheticsInjectRum(),
            },
          },
        })
      },
    }),
  }
}

export function startSyntheticsContext(hooks: Hooks) {
  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (!isSyntheticsTest()) {
      return SKIPPED
    }

    return {
      type: eventType,
      session: {
        type: SessionType.SYNTHETICS,
      },
      synthetics: {
        ...getSyntheticsContext(),
        injected: willSyntheticsInjectRum(),
      },
    }
  })
}
