import type { Context, RelativeTime } from '@datadog/browser-core'
import {
  willSyntheticsInjectRum,
  addTelemetryDebug,
  getSyntheticsTestId,
  getSyntheticsResultId,
  HookNames,
  SKIPPED,
} from '@datadog/browser-core'
import type { Hooks } from '../hooks'

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => Context | undefined
}

interface BrowserWindow {
  DD_RUM?: Rum
  DD_RUM_SYNTHETICS?: Rum
}

export function startRUMInternalContext(hooks: Hooks) {
  const browserWindow = window as BrowserWindow
  let logsSentBeforeRumInjectionTelemetryAdded = false

  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const internalContext = getRUMInternalContext(startTime)
    if (!internalContext) {
      return SKIPPED
    }

    return internalContext
  })

  hooks.register(HookNames.AssembleTelemetry, ({ startTime }) => {
    const internalContext = getRUMInternalContext(startTime)

    if (!internalContext) {
      return SKIPPED
    }

    return {
      application: internalContext.application_id ? { id: internalContext.application_id as string } : undefined,
      view: internalContext.view ? { id: (internalContext.view as Context).id as string } : undefined,
      action: internalContext.user_action ? { id: (internalContext.user_action as Context).id as string } : undefined,
    }
  })

  function getRUMInternalContext(startTime?: RelativeTime) {
    const willSyntheticsInjectRumResult = willSyntheticsInjectRum()
    const rumSource = willSyntheticsInjectRumResult ? browserWindow.DD_RUM_SYNTHETICS : browserWindow.DD_RUM
    const rumContext = getInternalContextFromRumGlobal(startTime, rumSource)

    if (rumContext) {
      return rumContext
    }

    if (willSyntheticsInjectRumResult && !logsSentBeforeRumInjectionTelemetryAdded) {
      logsSentBeforeRumInjectionTelemetryAdded = true
      addTelemetryDebug('Logs sent before RUM is injected by the synthetics worker', {
        testId: getSyntheticsTestId(),
        resultId: getSyntheticsResultId(),
      })
    }
  }

  function getInternalContextFromRumGlobal(startTime?: RelativeTime, rumGlobal?: Rum): Context | undefined {
    if (rumGlobal && rumGlobal.getInternalContext) {
      return rumGlobal.getInternalContext(startTime)
    }
  }

  return {
    getRUMInternalContext,
    stop: () => {
      logsSentBeforeRumInjectionTelemetryAdded = false
    },
  }
}
