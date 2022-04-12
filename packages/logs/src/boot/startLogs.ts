import type { Context, MonitoringMessage, TelemetryEvent } from '@datadog/browser-core'
import {
  areCookiesAuthorized,
  combine,
  canUseEventBridge,
  getEventBridge,
  startInternalMonitoring,
  startBatchWithReplica,
} from '@datadog/browser-core'
import type { LogsMessage } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration } from '../domain/configuration'
import { buildAssemble, getRUMInternalContext } from '../domain/assemble'
import type { Sender } from '../domain/sender'
import { startConsoleCollection } from '../domain/logsCollection/console/consoleCollection'
import { startReportCollection } from '../domain/logsCollection/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/logsCollection/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/logsCollection/runtimeError/runtimeErrorCollection'

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

  startNetworkErrorCollection(configuration, sender)
  startRuntimeErrorCollection(configuration, sender)
  startConsoleCollection(configuration, sender)
  startReportCollection(configuration, sender)

  const session =
    areCookiesAuthorized(configuration.cookieOptions) && !canUseEventBridge()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  return doStartLogs(configuration, session, sender)
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

export function doStartLogs(configuration: LogsConfiguration, sessionManager: LogsSessionManager, sender: Sender) {
  const assemble = buildAssemble(sessionManager, configuration, sender)

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

  return {
    send: (message: LogsMessage, currentContext: Context) => {
      const contextualizedMessage = assemble(message, currentContext)
      if (contextualizedMessage) {
        onLogEventCollected(contextualizedMessage)
      }
    },
  }
}
