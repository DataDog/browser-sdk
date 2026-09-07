import type { ClocksState } from '@datadog/js-core/time'
import type { Observable, BufferedData } from '@datadog/browser-core'
import type { Context } from '@datadog/js-core/util'
import { timeStampNow } from '@datadog/js-core/time'
import { BufferedDataType, ErrorSource } from '@datadog/browser-core'
import { ConsoleApiName } from '@datadog/js-core/util'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle, RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'
import type { RawLogsEvent } from '../../rawLogsEvent.types'
import { createErrorFieldFromRawError } from '../createErrorFieldFromRawError'

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

export function startConsoleCollection(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  bufferedDataObservable: Observable<BufferedData>
) {
  const subscription = bufferedDataObservable.subscribe(({ data: log, type }) => {
    if (type !== BufferedDataType.CONSOLE || !configuration.forwardConsoleLogs.includes(log.api)) {
      return
    }
    const collectedData: RawLogsEventCollectedData<RawLogsEvent> = {
      rawLogsEvent: {
        date: timeStampNow(),
        message: log.message,
        origin: ErrorSource.CONSOLE,
        error: log.error && createErrorFieldFromRawError(log.error),
        _dd: log.error && { debug_ids: log.error.debugIds },
        status: LogStatusForApi[log.api],
      },
      messageContext: log.error?.context,
      domainContext: {
        handlingStack: log.handlingStack,
      },
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, collectedData)
  })

  return { stop: () => subscription.unsubscribe() }
}
