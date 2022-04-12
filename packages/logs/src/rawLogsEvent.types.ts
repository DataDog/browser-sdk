import type { Context, ErrorSource, TimeStamp } from '@datadog/browser-core'
import type { StatusType } from './domain/logger'

export interface RawLogsEvent {
  date?: TimeStamp
  message: string
  status: StatusType
  origin?: ErrorSource
  logger?: {
    name: string
    [k: string]: unknown
  }
  error?: {
    kind?: string
    origin: ErrorSource
    stack?: string
    [k: string]: unknown
  }
  http?: {
    method: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH'
    status_code: number
    url: string
    [k: string]: unknown
  }
}

export interface CommonContext {
  date: TimeStamp
  view: {
    referrer: string
    url: string
  }
  context: Context
}
