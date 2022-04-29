import type { Context, ClocksState, ConsoleLog } from '@datadog/browser-core'
import { ConsoleApiName, ErrorSource, initConsoleObservable } from '@datadog/browser-core'
import type { LogsEvent } from '../../../logsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import type { Sender } from '../../sender'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

const LogStatusForApi = {
  [ConsoleApiName.log]: StatusType.info,
  [ConsoleApiName.debug]: StatusType.debug,
  [ConsoleApiName.info]: StatusType.info,
  [ConsoleApiName.warn]: StatusType.warn,
  [ConsoleApiName.error]: StatusType.error,
}
export function startConsoleCollection(configuration: LogsConfiguration, sender: Sender) {
  const consoleObservable = initConsoleObservable(configuration.forwardConsoleLogs)
  const consoleSubscription = consoleObservable.subscribe(reportConsoleLog)

  function reportConsoleLog(log: ConsoleLog) {
    const messageContext: Partial<LogsEvent> = {
      origin: ErrorSource.CONSOLE,
    }
    if (log.api === ConsoleApiName.error) {
      messageContext.error = {
        origin: ErrorSource.CONSOLE, // Todo: Remove in the next major release
        stack: log.stack,
      }
    }
    sender.sendToHttp(log.message, messageContext, LogStatusForApi[log.api])
  }

  return {
    stop: () => {
      consoleSubscription.unsubscribe()
    },
  }
}
