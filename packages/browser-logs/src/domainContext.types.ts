import type { ErrorSource, RawReportError } from '@datadog/browser-core'

export type LogsEventDomainContext<T extends ErrorSource = any> = T extends typeof ErrorSource.NETWORK
  ? NetworkLogsEventDomainContext
  : T extends typeof ErrorSource.CONSOLE
    ? ConsoleLogsEventDomainContext
    : T extends typeof ErrorSource.LOGGER
      ? LoggerLogsEventDomainContext
      : T extends typeof ErrorSource.REPORT
        ? ReportLogsEventDomainContext
        : undefined

export interface NetworkLogsEventDomainContext {
  handlingStack?: string
}

export interface ConsoleLogsEventDomainContext {
  handlingStack: string
}

export interface LoggerLogsEventDomainContext {
  handlingStack: string
}

export interface ReportLogsEventDomainContext {
  report: RawReportError['originalError']
}
