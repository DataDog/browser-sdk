import type { RelativeTime } from '@datadog/browser-core'
import type { RawLogsEventCollectedData } from '../lifeCycle'

export type LogsSignal = { type: 'sessionStarted'; sessionId: string } | { type: 'sessionExpired' }

export interface LogsObservation {
  readonly type: 'log'
  readonly startTime: RelativeTime
  readonly data: RawLogsEventCollectedData
}

// type needed: Pipeline<TEventMap> requires TEventMap extends Record<string, unknown>,
// which interfaces cannot satisfy without an explicit index signature
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LogsEvents = {
  observation: LogsObservation
  signal: LogsSignal
}
