import type { Context, ErrorSource, RawErrorCause, TimeStamp, User, ErrorHandling } from '@datadog/browser-core'
import type { StatusType } from './domain/logger/isAuthorized'

export type RawLogsEvent =
  | RawConsoleLogsEvent
  | RawNetworkLogsEvent
  | RawLoggerLogsEvent
  | RawAgentLogsEvent
  | RawReportLogsEvent
  | RawRuntimeLogsEvent

type Error = {
  message?: string
  kind?: string
  stack?: string
  fingerprint?: string
  causes?: RawErrorCause[]
  handling: ErrorHandling | undefined
}

interface CommonRawLogsEvent {
  date: TimeStamp
  message: string
  status: StatusType
  error?: Error
  origin: ErrorSource
}

export interface RawConsoleLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.CONSOLE
}

export interface RawLoggerLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.LOGGER
}

export interface RawNetworkLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.NETWORK
  status: typeof StatusType.error
  error: Error
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

export interface RawRuntimeLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.SOURCE
  status: typeof StatusType.error
  error: Error
}

export interface RawAgentLogsEvent extends CommonRawLogsEvent {
  origin: typeof ErrorSource.AGENT
  status: typeof StatusType.error
}

export interface CommonContext {
  view: {
    referrer: string
    url: string
  }
  context: Context
  user: User
  // We don't want to enforce id internally so use Context as internal type
  account: Context
}
