import type { Context, EventRateLimiter, RawError, RelativeTime } from '@datadog/browser-core'
import {
  getSyntheticsResultId,
  getSyntheticsTestId,
  addTelemetryDebug,
  willSyntheticsInjectRum,
  ErrorSource,
  combine,
  createEventRateLimiter,
  getRelativeTime,
  isEmptyObject,
} from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { STATUSES } from './logger'
import type { LogsSessionManager } from './logsSessionManager'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  buildCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, configuration.eventRateLimiterThreshold, reportError)
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined }) => {
      const startTime = getRelativeTime(rawLogsEvent.date)
      const session = sessionManager.findTrackedSession(startTime)

      if (!session) {
        return
      }

      const commonContext = savedCommonContext || buildCommonContext()
      const log = combine(
        {
          service: configuration.service,
          session_id: session.id,
          // Insert user first to allow overrides from global context
          usr: !isEmptyObject(commonContext.user) ? commonContext.user : undefined,
          view: commonContext.view,
        },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLogsEvent,
        messageContext
      )

      if (
        configuration.beforeSend?.(log) === false ||
        (log.origin !== ErrorSource.AGENT &&
          (logRateLimiters[log.status] ?? logRateLimiters['custom']).isLimitReached())
      ) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.LOG_COLLECTED, log)
    }
  )
}

interface Rum {
  getInternalContext?: (startTime?: RelativeTime) => Context | undefined
}

interface BrowserWindow {
  DD_RUM?: Rum
  DD_RUM_SYNTHETICS?: Rum
}

let logsSentBeforeRumInjectionTelemetryAdded = false

export function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const browserWindow = window as BrowserWindow

  if (willSyntheticsInjectRum()) {
    const context = getInternalContextFromRumGlobal(browserWindow.DD_RUM_SYNTHETICS)
    if (!context && !logsSentBeforeRumInjectionTelemetryAdded) {
      logsSentBeforeRumInjectionTelemetryAdded = true
      addTelemetryDebug('Logs sent before RUM is injected by the synthetics worker', {
        testId: getSyntheticsTestId(),
        resultId: getSyntheticsResultId(),
      })
    }
    return context
  }

  return getInternalContextFromRumGlobal(browserWindow.DD_RUM)

  function getInternalContextFromRumGlobal(rumGlobal?: Rum): Context | undefined {
    if (rumGlobal && rumGlobal.getInternalContext) {
      return rumGlobal.getInternalContext(startTime)
    }
  }
}

export function resetRUMInternalContext() {
  logsSentBeforeRumInjectionTelemetryAdded = false
}
