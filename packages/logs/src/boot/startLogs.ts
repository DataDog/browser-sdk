import type { Context, RawError, MonitoringMessage, TelemetryEvent, RawReport, Observable } from '@datadog/browser-core'
import {
  areCookiesAuthorized,
  combine,
  canUseEventBridge,
  getEventBridge,
  startInternalMonitoring,
  RawReportType,
  initReportObservable,
  ErrorSource,
  getFileFromStackTraceString,
  startBatchWithReplica,
} from '@datadog/browser-core'
import type { LogsMessage } from '../domain/logger'
import { StatusType } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration } from '../domain/configuration'
import type { LogsEvent } from '../logsEvent.types'
import { buildAssemble, getRUMInternalContext } from '../domain/assemble'
import type { Sender } from '../domain/sender'
import { startRawErrorCollection } from '../domain/logsCollection/rawErrorCollection'
import { startConsoleCollection } from '../domain/logsCollection/consoleCollection'

const LogStatusForReport = {
  [RawReportType.cspViolation]: StatusType.error,
  [RawReportType.intervention]: StatusType.error,
  [RawReportType.deprecation]: StatusType.warn,
}

export function startLogs(configuration: LogsConfiguration, sender: Sender) {
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

  const { reportRawError } = startRawErrorCollection(configuration, sender)
  startConsoleCollection(configuration, sender)

  const reportObservable = initReportObservable(configuration.forwardReports)

  const session =
    areCookiesAuthorized(configuration.cookieOptions) && !canUseEventBridge()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  return doStartLogs(configuration, reportRawError, reportObservable, session, sender)
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
  reportRawError: (error: RawError) => void,
  reportObservable: Observable<RawReport>,
  sessionManager: LogsSessionManager,
  sender: Sender
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

    sender.sendToHttp(message, messageContext, logStatus)
  }

  const reportSubscription = reportObservable.subscribe(logReport)

  return {
    stop: () => {
      reportSubscription.unsubscribe()
    },
    send: (message: LogsMessage, currentContext: Context) => {
      const contextualizedMessage = assemble(message, currentContext)
      if (contextualizedMessage) {
        onLogEventCollected(contextualizedMessage)
      }
    },
  }
}
