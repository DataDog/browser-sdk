import type { Context, ErrorSource, TimeStamp } from '@datadog/browser-core'
import type { StatusType } from './domain/logger'

export type RawLogsEvent =
  | RawConsoleLogsEvent
  | RawNetworkLogsEvent
  | RawLoggerLogsEvent
  | RawAgentLogsEvent
  | RawReportLogsEvent
  | RawRuntimeLogsEvent

export type RawLogsEventOrigin = RawLogsEvent['origin']

type Error = {
  kind?: string
  origin: ErrorSource // Todo: Remove in the next major release
  stack?: string
  [k: string]: unknown
}

interface CommonRawLogsEvent {
  message: string
  status: StatusType
  error?: Error
}

interface CommonRawErrorLogsEvent extends CommonRawLogsEvent {
  status: typeof StatusType.error
  error: Error
}

export interface RawConsoleLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.CONSOLE
}

export interface RawLoggerLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.LOGGER
}

export interface RawNetworkLogsEvent extends CommonRawErrorLogsEvent {
  date: TimeStamp
  origin: typeof ErrorSource.NETWORK
  http: {
    method: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH'
    status_code: number
    url: string
    [k: string]: unknown
  }
}

export interface RawReportLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.REPORT
}

export interface RawRuntimeLogsEvent extends CommonRawErrorLogsEvent {
  date: TimeStamp
  origin: typeof ErrorSource.SOURCE
}

export interface RawAgentLogsEvent extends CommonRawErrorLogsEvent {
  date: TimeStamp
  origin: typeof ErrorSource.AGENT
}

export interface CommonContext {
  date: TimeStamp
  view: {
    referrer: string
    url: string
  }
  context: Context
}
