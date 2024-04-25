import type { ConsoleApiName, Context, TimeStamp } from '@datadog/browser-core'
import {
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
  [StatusType.OK]: 0,
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

function displayInConsole({ message, status }: LogsMessage, messageContext: Context | undefined) {
  const display = (api: ConsoleApiName) => originalConsoleMethods[api].call(globalConsole, message, messageContext)

  switch (status) {
    case 'OK':
      display('debug')
      break
    case 'notice':
      display('info')
      break
    case 'critical':
    case 'alert':
    case 'emerg':
      display('error')
      break
    default:
      display(status)
  }
}
