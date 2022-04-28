import type { Context, ClocksState, ConsoleLog } from '@datadog/browser-core'
import { timeStampNow, ConsoleApiName, ErrorSource, initConsoleObservable } from '@datadog/browser-core'
import type { RawConsoleLogsEvent } from '../../../rawLogsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'

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
export function startConsoleCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  const consoleSubscription = initConsoleObservable(configuration.forwardConsoleLogs).subscribe((log: ConsoleLog) => {
    lifeCycle.notify<RawConsoleLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: timeStampNow(),
        message: log.message,
        origin: ErrorSource.CONSOLE,
        error:
          log.api === ConsoleApiName.error
            ? {
                origin: ErrorSource.CONSOLE, // Todo: Remove in the next major release
                stack: log.stack,
              }
            : undefined,
        status: LogStatusForApi[log.api],
      },
    })
  })

  return {
    stop: () => {
      consoleSubscription.unsubscribe()
    },
  }
}
