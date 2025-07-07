import type { Context, TimeStamp } from '@datadog/browser-core'
import {
  combine,
  ErrorSource,
  timeStampNow,
  originalConsoleMethods,
  globalConsole,
  ConsoleApiName,
} from '@datadog/browser-core'
import type { CommonContext, RawLogsEvent } from '../../rawLogsEvent.types'
import type { LifeCycle, RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { Logger, LogsMessage } from '../logger'
import { HandlerType } from '../logger'
import { isAuthorized, StatusType } from './isAuthorized'

export function startLoggerCollection(lifeCycle: LifeCycle) {
  function handleLog(
    logsMessage: LogsMessage,
    logger: Logger,
    handlingStack?: string,
    savedCommonContext?: CommonContext,
    savedDate?: TimeStamp
  ) {
    const messageContext = combine(logger.getContext(), logsMessage.context)

    if (isAuthorized(logsMessage.status, HandlerType.console, logger)) {
      displayInConsole(logsMessage, messageContext)
    }

    if (isAuthorized(logsMessage.status, HandlerType.http, logger)) {
      const rawLogEventData: RawLogsEventCollectedData<RawLogsEvent> = {
        rawLogsEvent: {
          date: savedDate || timeStampNow(),
          message: logsMessage.message,
          status: logsMessage.status,
          origin: ErrorSource.LOGGER,
        },
        messageContext,
        savedCommonContext,
      }

      if (handlingStack) {
        rawLogEventData.domainContext = { handlingStack }
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, rawLogEventData)
    }
  }

  return {
    handleLog,
  }
}
const loggerToConsoleApiName: { [key in StatusType]: ConsoleApiName } = {
  [StatusType.ok]: ConsoleApiName.debug,
  [StatusType.debug]: ConsoleApiName.debug,
  [StatusType.info]: ConsoleApiName.info,
  [StatusType.notice]: ConsoleApiName.info,
  [StatusType.warn]: ConsoleApiName.warn,
  [StatusType.error]: ConsoleApiName.error,
  [StatusType.critical]: ConsoleApiName.error,
  [StatusType.alert]: ConsoleApiName.error,
  [StatusType.emerg]: ConsoleApiName.error,
}

function displayInConsole({ status, message }: LogsMessage, messageContext: Context | undefined) {
  originalConsoleMethods[loggerToConsoleApiName[status]].call(globalConsole, message, messageContext)
}
