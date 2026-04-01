import {
  SKIPPED,
  getSyntheticsContext,
  HookNames,
  willSyntheticsInjectRum,
  isSyntheticsTest,
} from '@datadog/browser-core'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

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
