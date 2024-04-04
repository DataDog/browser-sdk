import type { ErrorSource } from '@datadog/browser-core'

export type LogsEventDomainContext<T extends ErrorSource> = T extends typeof ErrorSource.NETWORK
  ? NetworkLogsEventDomainContext
  : never

export type NetworkLogsEventDomainContext = {
  isAborted: boolean
}
