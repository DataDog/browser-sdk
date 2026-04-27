import {
  SKIPPED,
  getSyntheticsContext,
  HookNames,
  willSyntheticsInjectRum,
  isSyntheticsTest,
} from '@datadog/browser-core'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import { SessionType } from './sessionContext'

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
