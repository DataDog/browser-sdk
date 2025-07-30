import type { RelativeTime, RumInternalContext } from '@datadog/browser-core'
import {
  willSyntheticsInjectRum,
  addTelemetryDebug,
  getSyntheticsTestId,
  getSyntheticsResultId,
  HookNames,
  SKIPPED,
  isServiceWorkerContext,
  globalVar,
} from '@datadog/browser-core'
import type { Hooks } from '../hooks'

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => RumInternalContext | undefined
}

interface BrowserWindow {
  DD_RUM?: Rum
  DD_RUM_SYNTHETICS?: Rum
}

export function startRUMInternalContext(hooks: Hooks) {
  if (isServiceWorkerContext()) {
    // No RUM in Service Worker; return stub with no-op stop
    return { stop: () => undefined }
  }

  const browserWindow = globalVar as unknown as BrowserWindow
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
      application: { id: internalContext.application_id },
      view: { id: internalContext.view?.id },
      action: { id: internalContext.user_action?.id as string },
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

  function getInternalContextFromRumGlobal(startTime?: RelativeTime, rumGlobal?: Rum): RumInternalContext | undefined {
    if (rumGlobal && rumGlobal.getInternalContext) {
      return rumGlobal.getInternalContext(startTime)
    }
  }

  return {
    stop: () => {
      logsSentBeforeRumInjectionTelemetryAdded = false
    },
  }
}
