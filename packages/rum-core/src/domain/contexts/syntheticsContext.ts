import { getSyntheticsResultId, getSyntheticsTestId, willSyntheticsInjectRum } from '@datadog/browser-core'
import { HookNames, SKIPPED } from '../../hooks'
import type { Hooks, DefaultRumEventAttributes } from '../../hooks'
import { SessionType } from '../rumSessionManager'

export function startSyntheticsContext(hooks: Hooks) {
  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    const testId = getSyntheticsTestId()
    const resultId = getSyntheticsResultId()
    if (!testId || !resultId) {
      return SKIPPED
    }

    return {
      type: eventType,
      session: {
        type: SessionType.SYNTHETICS,
      },
      synthetics: {
        test_id: testId,
        result_id: resultId,
        injected: willSyntheticsInjectRum(),
      },
    }
  })
}
