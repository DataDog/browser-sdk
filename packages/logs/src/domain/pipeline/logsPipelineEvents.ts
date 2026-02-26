import type { RelativeTime } from '@datadog/browser-core'
import type { RawLogsEventCollectedData } from '../lifeCycle'

export type LogsSignal = { type: 'sessionStarted'; sessionId: string } | { type: 'sessionExpired' }

export interface LogsObservation {
  readonly type: 'log'
  readonly startTime: RelativeTime
  readonly data: RawLogsEventCollectedData
}

export type LogsEvents = {
  observation: LogsObservation
  signal: LogsSignal
}
