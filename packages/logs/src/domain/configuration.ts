import { InitConfiguration } from '@datadog/browser-core'
import { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  forwardErrorsToLogs?: boolean | undefined
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>
