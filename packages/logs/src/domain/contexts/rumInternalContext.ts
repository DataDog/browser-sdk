import type { RelativeTime, Context } from '@datadog/browser-core'
import {
  willSyntheticsInjectRum,
  addTelemetryDebug,
  getSyntheticsTestId,
  getSyntheticsResultId,
  getGlobalObject,
} from '@datadog/browser-core'

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => Context | undefined
}

interface GlobalWithRum {
  DD_RUM?: Rum
  DD_RUM_SYNTHETICS?: Rum
}

let logsSentBeforeRumInjectionTelemetryAdded = false

export function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const globalObject = getGlobalObject<GlobalWithRum>()

  if (willSyntheticsInjectRum()) {
    const context = getInternalContextFromRumGlobal(globalObject.DD_RUM_SYNTHETICS)
    if (!context && !logsSentBeforeRumInjectionTelemetryAdded) {
      logsSentBeforeRumInjectionTelemetryAdded = true
      addTelemetryDebug('Logs sent before RUM is injected by the synthetics worker', {
        testId: getSyntheticsTestId(),
        resultId: getSyntheticsResultId(),
      })
    }
    return context
  }

  return getInternalContextFromRumGlobal(globalObject.DD_RUM)

  function getInternalContextFromRumGlobal(rumGlobal?: Rum): Context | undefined {
    if (rumGlobal && rumGlobal.getInternalContext) {
      return rumGlobal.getInternalContext(startTime)
    }
  }
}

export function resetRUMInternalContext() {
  logsSentBeforeRumInjectionTelemetryAdded = false
}