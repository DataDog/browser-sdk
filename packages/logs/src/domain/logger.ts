import type { ContextValue, TimeStamp } from '@datadog/browser-core'
import { combine, ErrorSource, monitored } from '@datadog/browser-core'
import type { Sender } from './sender'

export const StatusType = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  warn: 'warn',
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type StatusType = typeof StatusType[keyof typeof StatusType]

export const HandlerType = {
  console: 'console',
  http: 'http',
  silent: 'silent',
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type HandlerType = typeof HandlerType[keyof typeof HandlerType]
export const STATUSES = Object.keys(StatusType) as StatusType[]

export interface LogsMessage {
  message: string
  status: StatusType
  date?: TimeStamp
  [key: string]: ContextValue
}

export class Logger {
  constructor(private sender: Sender) {}

  @monitored
  log(message: string, messageContext?: object, status: StatusType = StatusType.info) {
    this.sender.sendLog(
      message,
      combine(
        {
          origin: ErrorSource.LOGGER,
        },
        messageContext
      ),
      status
    )
  }

  debug(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.debug)
  }

  info(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.info)
  }

  warn(message: string, messageContext?: object) {
    this.log(message, messageContext, StatusType.warn)
  }

  error(message: string, messageContext?: object) {
    const errorOrigin = {
      error: {
        // Todo: remove error origin in the next major version
        origin: ErrorSource.LOGGER,
      },
    }
    this.log(message, combine(errorOrigin, messageContext), StatusType.error)
  }

  setContext(context: object) {
    this.sender.getContextManager().set(context)
  }

  addContext(key: string, value: any) {
    this.sender.getContextManager().add(key, value)
  }

  removeContext(key: string) {
    this.sender.getContextManager().remove(key)
  }

  setHandler(handler: HandlerType | HandlerType[]) {
    this.sender.setHandler(handler)
  }

  setLevel(level: StatusType) {
    this.sender.setLevel(level)
  }
}
