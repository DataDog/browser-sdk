import type { Context, ClocksState, ConsoleLog } from '@datadog/browser-core'
import { timeStampNow, ConsoleApiName, ErrorSource, initConsoleObservable } from '@datadog/browser-core'
import type { LifeCycle, RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'
import type { RawLogsEvent } from '../../types/rawLogsEvent.types'
import { createErrorFieldFromRawError } from '../createErrorFieldFromRawError'
import type { LogsCoreConfiguration } from '../configuration.types'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export const LogStatusForApi = {
  [ConsoleApiName.log]: StatusType.info,
  [ConsoleApiName.debug]: StatusType.debug,
  [ConsoleApiName.info]: StatusType.info,
  [ConsoleApiName.warn]: StatusType.warn,
  [ConsoleApiName.error]: StatusType.error,
}
export function startConsoleCollection(configuration: LogsCoreConfiguration, lifeCycle: LifeCycle) {
  const consoleSubscription = initConsoleObservable(configuration.forwardConsoleLogs).subscribe((log: ConsoleLog) => {
    const collectedData: RawLogsEventCollectedData<RawLogsEvent> = {
      rawLogsEvent: {
        date: timeStampNow(),
        message: log.message,
        origin: ErrorSource.CONSOLE,
        error: log.error && createErrorFieldFromRawError(log.error),
        status: LogStatusForApi[log.api],
      },
      messageContext: log.error?.context,
      domainContext: {
        handlingStack: log.handlingStack,
      },
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, collectedData)
  })

  return {
    stop: () => {
      consoleSubscription.unsubscribe()
    },
  }
}
