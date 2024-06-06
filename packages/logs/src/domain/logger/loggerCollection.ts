import type { Context, TimeStamp } from '@datadog/browser-core'
import {
  ConsoleApiName,
  includes,
  combine,
  ErrorSource,
  timeStampNow,
  originalConsoleMethods,
  globalConsole,
} from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { Logger, LogsMessage } from '../logger'
import { StatusType, HandlerType } from '../logger'

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.ok]: 0,
  [StatusType.debug]: 1,
  [StatusType.info]: 2,
  [StatusType.notice]: 4,
  [StatusType.warn]: 5,
  [StatusType.error]: 6,
  [StatusType.critical]: 7,
  [StatusType.alert]: 8,
  [StatusType.emerg]: 9,
}

export function startLoggerCollection(lifeCycle: LifeCycle) {
  function handleLog(
    logsMessage: LogsMessage,
    logger: Logger,
    savedCommonContext?: CommonContext,
    savedDate?: TimeStamp
  ) {
    const messageContext = combine(logger.getContext(), logsMessage.context)

    if (isAuthorized(logsMessage.status, HandlerType.console, logger)) {
      displayInConsole(logsMessage, messageContext)
    }

    if (isAuthorized(logsMessage.status, HandlerType.http, logger)) {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: {
          date: savedDate || timeStampNow(),
          message: logsMessage.message,
          status: logsMessage.status,
          origin: ErrorSource.LOGGER,
        },
        messageContext,
        savedCommonContext,
      })
    }
  }

  return {
    handleLog,
  }
}

export function isAuthorized(status: StatusType, handlerType: HandlerType, logger: Logger) {
  const loggerHandler = logger.getHandler()
  const sanitizedHandlerType = Array.isArray(loggerHandler) ? loggerHandler : [loggerHandler]
  return (
    STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[logger.getLevel()] && includes(sanitizedHandlerType, handlerType)
  )
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
