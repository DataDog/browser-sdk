import type { Context } from '@datadog/browser-core'
import { combine, createContextManager, display, includes } from '@datadog/browser-core'
import type { LogsMessage } from './logger'
import { HandlerType, StatusType } from './logger'

export type Sender = ReturnType<typeof createSender>

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export function createSender(
  sendToHttpImpl: (message: LogsMessage) => void,
  handlerType: HandlerType | HandlerType[] = HandlerType.http,
  level: StatusType = StatusType.debug,
  loggerContext: Context = {}
) {
  const conf = {
    level,
    handlerType,
  }
  const contextManager = createContextManager()
  contextManager.set(loggerContext)

  function isAuthorized(status: StatusType, handlerType: HandlerType) {
    const sanitizedHandlerType = Array.isArray(conf.handlerType) ? conf.handlerType : [conf.handlerType]
    return STATUS_PRIORITIES[status] >= STATUS_PRIORITIES[conf.level] && includes(sanitizedHandlerType, handlerType)
  }

  function sendToHttp(message: string, messageContext: object | undefined, status: StatusType) {
    if (isAuthorized(status, HandlerType.http)) {
      sendToHttpImpl(combine({ message, status }, contextManager.get(), messageContext))
    }
  }

  function sendToConsole(message: string, messageContext: object | undefined, status: StatusType) {
    if (isAuthorized(status, HandlerType.console)) {
      display.log(`${status}: ${message}`, combine(contextManager.get(), messageContext))
    }
  }

  return {
    getContextManager() {
      return contextManager
    },

    setLevel(level: StatusType) {
      conf.level = level
    },

    setHandler(handlerType: HandlerType | HandlerType[]) {
      conf.handlerType = handlerType
    },

    sendToHttp,
    sendLog(message: string, messageContext?: object, status: StatusType = StatusType.info) {
      sendToHttp(message, messageContext, status)
      sendToConsole(message, messageContext, status)
    },
  }
}
