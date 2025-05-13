import { getSyntheticsResultId, getSyntheticsTestId, willSyntheticsInjectRum } from '@flashcatcloud/browser-core'
import { HookNames } from '../../hooks'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { SessionType } from '../rumSessionManager'

export function startSyntheticsContext(hooks: Hooks) {
  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => {
    const testId = getSyntheticsTestId()
    const resultId = getSyntheticsResultId()
    if (!testId || !resultId) {
      return
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
