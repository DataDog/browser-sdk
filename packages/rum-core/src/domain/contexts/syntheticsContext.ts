import {
  SKIPPED,
  getSyntheticsResultId,
  getSyntheticsTestId,
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

    const testId = getSyntheticsTestId()
    const resultId = getSyntheticsResultId()

    return {
      type: eventType,
      session: {
        type: SessionType.SYNTHETICS,
      },
      synthetics: {
        test_id: testId!,
        result_id: resultId!,
        injected: willSyntheticsInjectRum(),
      },
    }
  })
}
