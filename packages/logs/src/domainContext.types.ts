import type { ErrorSource } from '@datadog/browser-core'

export type LogsEventDomainContext<T extends ErrorSource = any> = T extends typeof ErrorSource.NETWORK
  ? NetworkLogsEventDomainContext
  : T extends typeof ErrorSource.CONSOLE
    ? ConsoleLogsEventDomainContext
    : never

export type NetworkLogsEventDomainContext = {
  isAborted: boolean
}

export type ConsoleLogsEventDomainContext = {
  handlingStack: string
}
