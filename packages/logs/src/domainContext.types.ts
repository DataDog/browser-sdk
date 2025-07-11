import type { ErrorSource } from '@datadog/browser-core'

export type LogsEventDomainContext<T extends ErrorSource = any> = T extends typeof ErrorSource.NETWORK
  ? NetworkLogsEventDomainContext
  : T extends typeof ErrorSource.CONSOLE
    ? ConsoleLogsEventDomainContext
    : T extends typeof ErrorSource.LOGGER
      ? LoggerLogsEventDomainContext
      : never

export interface NetworkLogsEventDomainContext {
  isAborted: boolean
  handlingStack?: string
}

export interface ConsoleLogsEventDomainContext {
  handlingStack: string
}

export interface LoggerLogsEventDomainContext {
  handlingStack: string
}
