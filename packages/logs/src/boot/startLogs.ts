import type {
  ConsoleLog,
  Context,
  RawError,
  RelativeTime,
  MonitoringMessage,
  TelemetryEvent,
  RawReport,
} from '@datadog/browser-core'
import {
  areCookiesAuthorized,
  combine,
  createEventRateLimiter,
  Observable,
  trackRuntimeError,
  canUseEventBridge,
  getEventBridge,
  getRelativeTime,
  startInternalMonitoring,
  RawReportType,
  initReportObservable,
  initConsoleObservable,
  ConsoleApiName,
  ErrorSource,
  getFileFromStackTraceString,
  startBatchWithReplica,
} from '@datadog/browser-core'
import { trackNetworkError } from '../domain/trackNetworkError'
import type { Logger, LogsMessage } from '../domain/logger'
import { StatusType } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration } from '../domain/configuration'
import type { LogsEvent } from '../logsEvent.types'
import { buildAssemble, getRUMInternalContext } from '../domain/assemble'

const LogStatusForApi = {
  [ConsoleApiName.log]: StatusType.info,
  [ConsoleApiName.debug]: StatusType.debug,
  [ConsoleApiName.info]: StatusType.info,
  [ConsoleApiName.warn]: StatusType.warn,
  [ConsoleApiName.error]: StatusType.error,
}

const LogStatusForReport = {
  [RawReportType.cspViolation]: StatusType.error,
  [RawReportType.intervention]: StatusType.error,
  [RawReportType.deprecation]: StatusType.warn,
}

export function startLogs(configuration: LogsConfiguration, logger: Logger) {
  const internalMonitoring = startLogsInternalMonitoring(configuration)
  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: session.findTrackedSession()?.id }, getRUMInternalContext(), {
      view: { name: null, url: null, referrer: null },
    })
  )
  internalMonitoring.setTelemetryContextProvider(() => ({
    application: {
      id: getRUMInternalContext()?.application_id,
    },
    session: {
      id: session.findTrackedSession()?.id,
    },
    view: {
      id: (getRUMInternalContext()?.view as Context)?.id,
    },
    action: {
      id: (getRUMInternalContext()?.user_action as Context)?.id,
    },
  }))

  const rawErrorObservable = new Observable<RawError>()

  if (configuration.forwardErrorsToLogs) {
    trackRuntimeError(rawErrorObservable)
    trackNetworkError(configuration, rawErrorObservable)
  }
  const consoleObservable = initConsoleObservable(configuration.forwardConsoleLogs)
  const reportObservable = initReportObservable(configuration.forwardReports)

  const session =
    areCookiesAuthorized(configuration.cookieOptions) && !canUseEventBridge()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  return doStartLogs(configuration, rawErrorObservable, consoleObservable, reportObservable, session, logger)
}

function startLogsInternalMonitoring(configuration: LogsConfiguration) {
  const internalMonitoring = startInternalMonitoring(configuration)
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_log' | 'internal_telemetry', MonitoringMessage | TelemetryEvent>()!
    internalMonitoring.monitoringMessageObservable.subscribe((message) => bridge.send('internal_log', message))
    internalMonitoring.telemetryEventObservable.subscribe((message) => bridge.send('internal_telemetry', message))
  } else {
    if (configuration.internalMonitoringEndpointBuilder) {
      const batch = startBatchWithReplica(
        configuration,
        configuration.internalMonitoringEndpointBuilder,
        configuration.replica?.internalMonitoringEndpointBuilder
      )
      internalMonitoring.monitoringMessageObservable.subscribe((message) => batch.add(message))
    }
    const monitoringBatch = startBatchWithReplica(
      configuration,
      configuration.rumEndpointBuilder,
      configuration.replica?.rumEndpointBuilder
    )
    internalMonitoring.telemetryEventObservable.subscribe((event) => monitoringBatch.add(event))
  }
  return internalMonitoring
}

export function doStartLogs(
  configuration: LogsConfiguration,
  rawErrorObservable: Observable<RawError>,
  consoleObservable: Observable<ConsoleLog>,
  reportObservable: Observable<RawReport>,
  sessionManager: LogsSessionManager,
  logger: Logger
) {
  const assemble = buildAssemble(sessionManager, configuration, reportRawError)

  let onLogEventCollected: (message: Context) => void
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'log', Context>()!
    onLogEventCollected = (message) => bridge.send('log', message)
  } else {
    const batch = startBatchWithReplica(
      configuration,
      configuration.logsEndpointBuilder,
      configuration.replica?.logsEndpointBuilder
    )
    onLogEventCollected = (message) => batch.add(message)
  }

  function reportRawError(error: RawError) {
    const messageContext: Partial<LogsEvent> = {
      date: error.startClocks.timeStamp,
      error: {
        kind: error.type,
        origin: error.source,
        stack: error.stack,
      },
    }
    if (error.resource) {
      messageContext.http = {
        method: error.resource.method as any, // Cast resource method because of case mismatch cf issue RUMF-1152
        status_code: error.resource.statusCode,
        url: error.resource.url,
      }
    }
    logger.error(error.message, messageContext)
  }

  function reportConsoleLog(log: ConsoleLog) {
    let messageContext: Partial<LogsEvent> | undefined
    if (log.api === ConsoleApiName.error) {
      messageContext = {
        error: {
          origin: ErrorSource.CONSOLE,
          stack: log.stack,
        },
      }
    }
    logger.log(log.message, messageContext, LogStatusForApi[log.api])
  }

  function logReport(report: RawReport) {
    let message = report.message
    let messageContext: Partial<LogsEvent> | undefined
    const logStatus = LogStatusForReport[report.type]
    if (logStatus === StatusType.error) {
      messageContext = {
        error: {
          kind: report.subtype,
          origin: ErrorSource.REPORT,
          stack: report.stack,
        },
      }
    } else if (report.stack) {
      message += ` Found in ${getFileFromStackTraceString(report.stack)!}`
    }

    logger.log(message, messageContext, logStatus)
  }

  rawErrorObservable.subscribe(reportRawError)
  consoleObservable.subscribe(reportConsoleLog)
  reportObservable.subscribe(logReport)

  return (message: LogsMessage, currentContext: Context) => {
    const contextualizedMessage = assemble(message, currentContext)
    if (contextualizedMessage) {
      onLogEventCollected(contextualizedMessage)
    }
  }
}
