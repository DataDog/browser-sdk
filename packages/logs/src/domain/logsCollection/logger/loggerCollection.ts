import type { TimeStamp } from '@datadog/browser-core'
import {
  objectHasValue,
  ConsoleApiName,
  includes,
  display,
  combine,
  ErrorSource,
  timeStampNow,
} from '@datadog/browser-core'
import type { CommonContext, RawLoggerLogsEvent } from '../../../rawLogsEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { Logger, LogsMessage } from '../../logger'
import { StatusType, HandlerType } from '../../logger'

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export function startLoggerCollection(lifeCycle: LifeCycle) {
  function handleLog(
    logsMessage: LogsMessage,
    logger: Logger,
    savedCommonContext?: CommonContext,
    savedDate?: TimeStamp
  ) {
    const messageContext = logsMessage.context

    sendToConsole(logsMessage, logger)

    lifeCycle.notify<RawLoggerLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: savedDate || timeStampNow(),
        message: logsMessage.message,
        status: logsMessage.status,
        origin: ErrorSource.LOGGER,
      },
      messageContext,
      savedCommonContext,
      logger,
    })
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

function sendToConsole(logsMessage: LogsMessage, logger: Logger) {
  if (isAuthorized(logsMessage.status, HandlerType.console, logger)) {
    const api = objectHasValue(ConsoleApiName, logsMessage.status) ? logsMessage.status : ConsoleApiName.log
    display[api](logsMessage.message, combine(logger.getContext(), logsMessage.context))
  }
}
