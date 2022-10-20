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
} from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { Logger } from './logger'
import { STATUSES, HandlerType } from './logger'
import { isAuthorized } from './logsCollection/logger/loggerCollection'
import type { LogsSessionManager } from './logsSessionManager'

export function startLogsAssembly(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  getCommonContext: () => CommonContext,
  mainLogger: Logger, // Todo: [RUMF-1230] Remove this parameter in the next major release
  reportError: (error: RawError) => void
) {
  const statusWithCustom = (STATUSES as string[]).concat(['custom'])
  const logRateLimiters: { [key: string]: EventRateLimiter } = {}
  statusWithCustom.forEach((status) => {
    logRateLimiters[status] = createEventRateLimiter(status, configuration.eventRateLimiterThreshold, reportError)
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_LOG_COLLECTED,
    ({ rawLogsEvent, messageContext = undefined, savedCommonContext = undefined, logger = mainLogger }) => {
      const startTime = getRelativeTime(rawLogsEvent.date)
      const session = sessionManager.findTrackedSession(startTime)

      if (!session) {
        return
      }

      const commonContext = savedCommonContext || getCommonContext()
      const log = combine(
        { service: configuration.service, session_id: session.id, view: commonContext.view },
        commonContext.context,
        getRUMInternalContext(startTime),
        rawLogsEvent,
        logger.getContext(),
        messageContext
      )

      if (
        // Todo: [RUMF-1230] Move this check to the logger collection in the next major release
        !isAuthorized(rawLogsEvent.status, HandlerType.http, logger) ||
        configuration.beforeSend?.(log) === false ||
        (log.error?.origin !== ErrorSource.AGENT &&
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
