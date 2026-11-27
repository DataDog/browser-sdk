import { globalObject } from '@datadog/js-core/util'
import type { RelativeTime } from '@datadog/js-core/time'
import type { RumInternalContext } from '@datadog/browser-core'
import { willSyntheticsInjectRum } from '@datadog/browser-core'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { Hooks } from '../hooks'

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => RumInternalContext | undefined
}

interface BrowserWindow {
  DD_RUM?: Rum
  DD_RUM_SYNTHETICS?: Rum
}

export function startRUMInternalContext(
  hooks: Hooks,
  getInternalContext: (startTime?: RelativeTime) => RumInternalContext | undefined
) {
  hooks.assembleEventDefaults.register(({ startTime }) => {
    const internalContext = getInternalContext(startTime)
    if (!internalContext) {
      return SKIPPED
    }

    return internalContext
  })

  hooks.assembleTelemetry.register(({ startTime }) => {
    const internalContext = getInternalContext(startTime)

    if (!internalContext) {
      return SKIPPED
    }

    return {
      application: { id: internalContext.application_id },
      view: { id: internalContext.view?.id },
      action: { id: internalContext.user_action?.id as string },
    }
  })
}

export function getRUMInternalContextFromGlobal(startTime?: RelativeTime): RumInternalContext | undefined {
  const browserWindow = globalObject as BrowserWindow
  const willSyntheticsInjectRumResult = willSyntheticsInjectRum()
  const rumSource = willSyntheticsInjectRumResult ? browserWindow.DD_RUM_SYNTHETICS : browserWindow.DD_RUM
  return rumSource?.getInternalContext?.(startTime)
}
