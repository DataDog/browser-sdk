import type { RelativeTime } from '@openobserve/js-core/time'
import type { RumInternalContext } from '@openobserve/browser-core'
import { globalObject, willSyntheticsInjectRum } from '@openobserve/browser-core'
import { SKIPPED } from '@openobserve/js-core/assembly'
import type { Hooks } from '../hooks'

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => RumInternalContext | undefined
}

interface BrowserWindow {
  OO_RUM?: Rum
  OO_RUM_SYNTHETICS?: Rum
}

export function startRUMInternalContext(hooks: Hooks) {
  const browserWindow = globalObject as BrowserWindow

  hooks.assemble.register(({ startTime }) => {
    const internalContext = getRUMInternalContext(startTime)
    if (!internalContext) {
      return SKIPPED
    }

    return internalContext
  })

  hooks.assembleTelemetry.register(({ startTime }) => {
    const internalContext = getRUMInternalContext(startTime)

    if (!internalContext) {
      return SKIPPED
    }

    return {
      application: { id: internalContext.application_id },
      view: { id: internalContext.view?.id },
      action: { id: internalContext.user_action?.id as string },
    }
  })

  function getRUMInternalContext(startTime?: RelativeTime) {
    const willSyntheticsInjectRumResult = willSyntheticsInjectRum()
    const rumSource = willSyntheticsInjectRumResult ? browserWindow.OO_RUM_SYNTHETICS : browserWindow.OO_RUM
    const rumContext = getInternalContextFromRumGlobal(startTime, rumSource)

    if (rumContext) {
      return rumContext
    }
  }

  function getInternalContextFromRumGlobal(startTime?: RelativeTime, rumGlobal?: Rum): RumInternalContext | undefined {
    if (rumGlobal?.getInternalContext) {
      return rumGlobal.getInternalContext(startTime)
    }
  }
}
