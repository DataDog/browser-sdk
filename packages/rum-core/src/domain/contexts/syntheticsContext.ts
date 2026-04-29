import {
  SKIPPED,
  getSyntheticsContext,
  getGlobalObject,
  HookNames,
  willSyntheticsInjectRum,
  isSyntheticsTest,
} from '@datadog/browser-core'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

interface CustomerRumGlobal {
  getInitConfiguration?(): { applicationId?: string } | undefined
}

function getCustomerRumApplicationId(): string | undefined {
  try {
    return getGlobalObject<{ DD_RUM?: CustomerRumGlobal }>().DD_RUM?.getInitConfiguration()?.applicationId
  } catch {
    return undefined
  }
}

export function startSyntheticsContext(hooks: Hooks) {
  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (!isSyntheticsTest()) {
      return SKIPPED
    }

    const originalApplicationId = getCustomerRumApplicationId()

    return {
      type: eventType,
      session: {
        type: SessionType.SYNTHETICS,
      },
      synthetics: {
        ...getSyntheticsContext(),
        injected: willSyntheticsInjectRum(),
        ...(originalApplicationId !== undefined && { original_application_id: originalApplicationId }),
      },
    }
  })
}
