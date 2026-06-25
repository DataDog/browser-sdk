import { getSyntheticsContext, willSyntheticsInjectRum, isSyntheticsTest } from '@datadog/browser-core'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'
import { SessionType } from './sessionContext'

export function startSyntheticsContext(assembleHook: AssembleHook) {
  assembleHook.register(({ eventType }): DefaultRumEventAttributes | SKIPPED => {
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
