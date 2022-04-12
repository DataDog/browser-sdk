import { includes, display, combine, ErrorSource, isExperimentalFeatureEnabled } from '@datadog/browser-core'
import type { CommonContext } from '../../../rawLogsEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { LoggerOptions, LogsMessage } from '../../logger'
import { StatusType, HandlerType } from '../../logger'

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export function startLoggerCollection(lifeCycle: LifeCycle) {
  function addLog(logsMessage: LogsMessage, loggerOptions: LoggerOptions, savedCommonContext?: CommonContext) {
    const messageContext = logsMessage.context

    if (isAuthorized(logsMessage.status, HandlerType.console, loggerOptions)) {
      display.log(
        `${logsMessage.status}: ${logsMessage.message}`,
        combine(loggerOptions.contextManager.get(), messageContext)
      )
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLog: {
        message: logsMessage.message,
        status: logsMessage.status,
        origin: isExperimentalFeatureEnabled('forward-logs') ? ErrorSource.LOGGER : undefined,
      },
      messageContext,
      commonContext: savedCommonContext,
      loggerOptions,
    })
  }

  return {
    addLog,
  }
}

export function isAuthorized(status: StatusType, handlerType: HandlerType, loggerOptions: LoggerOptions) {
  const sanitizedHandlerType = Array.isArray(loggerOptions.handlerType)
    ? loggerOptions.handlerType
    : [loggerOptions.handlerType]
  return (
    STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[loggerOptions.level] && includes(sanitizedHandlerType, handlerType)
  )
}
