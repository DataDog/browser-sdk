import { sendToExtension, startAccountContext, startGlobalContext, startUserContext } from '@datadog/browser-core'
import type { AbstractHooks, Batch, Context, ContextManager, EndpointBuilder, Telemetry } from '@datadog/browser-core'
import { bindContextManager, createBufferedDataFromMessageBus, MessageType } from '@datadog/browser-internal-next'
import type { CoreInitializeConfiguration, CoreSessionManager, InternalApi } from '@datadog/browser-internal-next'
import type { LogsEvent } from '@datadog/browser-logs'
import {
  buildCommonContext,
  LifeCycle,
  LifeCycleEventType,
  startConsoleCollection,
  startLoggerCollection,
  startLogsAssembly,
  startNetworkErrorCollection,
  startReportCollection,
  startReportError,
  startRuntimeErrorCollection,
  startSessionContext,
  validateAndBuildLogsConfiguration,
} from '@datadog/browser-logs/internal'

export function initialize({
  coreInitializeConfiguration,
  sessionManager,
  createBatch,
  hooks,
  internalApi,
  contexts,
}: {
  coreInitializeConfiguration: CoreInitializeConfiguration
  sessionManager: CoreSessionManager
  createBatch: (endpoints: EndpointBuilder[]) => Batch
  hooks: AbstractHooks
  telemetry: Telemetry
  internalApi: InternalApi
  contexts: {
    global: ContextManager
    user: ContextManager
    account: ContextManager
  }
}) {
  const configuration = validateAndBuildLogsConfiguration({
    ...coreInitializeConfiguration,
    ...coreInitializeConfiguration.logs!,
  })
  if (!configuration) {
    return
  }
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)

  // Start user and account context first to allow overrides from global context
  startSessionContext(hooks, configuration, sessionManager)
  const accountContext = startAccountContext(hooks, configuration, 'logs')
  const userContext = startUserContext(hooks, configuration, sessionManager, 'logs')
  const globalContext = startGlobalContext(hooks, configuration, 'logs', false)
  bindContextManager(contexts.global, globalContext)
  bindContextManager(contexts.user, userContext)
  bindContextManager(contexts.account, accountContext)

  // TODO: startRUMInternalContext(hooks)

  startNetworkErrorCollection(configuration, lifeCycle)
  const bufferedDataObservable = createBufferedDataFromMessageBus(internalApi.bus)
  startRuntimeErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)
  internalApi.bus.subscribe(({ clocks, message }) => {
    if (message.type === MessageType.LOGS_MESSAGE) {
      handleLog(
        message.message,
        message.logger,
        message.handlingStack,
        undefined, // CommonContext?
        clocks.timeStamp
      )
    }
  })

  startLogsAssembly(configuration, lifeCycle, hooks, buildCommonContext, reportError)

  const endpoints = [configuration.logsEndpointBuilder]
  if (configuration.replica) {
    endpoints.push(configuration.replica.logsEndpointBuilder)
  }

  const batch = createBatch(endpoints)

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
