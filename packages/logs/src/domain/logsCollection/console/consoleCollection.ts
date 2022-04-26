import type { Context, ClocksState, ConsoleLog } from '@datadog/browser-core'
import { ConsoleApiName, ErrorSource, initConsoleObservable, isExperimentalFeatureEnabled } from '@datadog/browser-core'
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
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: log.message,
        origin: isExperimentalFeatureEnabled('forward-logs') ? ErrorSource.CONSOLE : undefined,
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
