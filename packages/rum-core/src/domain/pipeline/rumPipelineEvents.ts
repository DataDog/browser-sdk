import type { ClocksState, TimeStamp } from '@datadog/browser-core'

export interface Observation {
  readonly type: string
  readonly startTime: number
  readonly duration?: number
  readonly data: Record<string, unknown>
}

export type RumSignal =
  | { type: 'sessionRenewed'; sessionId: string }
  | { type: 'sessionExpired' }
  | { type: 'viewCreated'; viewId: string; name?: string; startTimestamp: TimeStamp }
  | { type: 'pageMayExit'; reason: 'visibility_hidden' | 'before_unload' | 'page_frozen' }

export interface RawResourceData {
  url: string
  method?: string
  statusCode?: number
  startClocks: ClocksState
  duration: number
  size?: number
  // Full type expanded during migration
  [key: string]: unknown
}

export interface RawActionData {
  type: string
  name?: string
  startClocks: ClocksState
  duration?: number
  [key: string]: unknown
}

export type RumCoreEvents = {
  resource: RawResourceData
  action: RawActionData
  observation: Observation
  signal: RumSignal
}
