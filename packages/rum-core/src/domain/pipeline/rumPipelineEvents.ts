export interface Observation {
  readonly type: string
  readonly startTime: number
  readonly duration?: number
  readonly data: Record<string, unknown>
}

export type RumSignal =
  | { type: 'sessionStarted'; sessionId: string }
  | { type: 'sessionExpired' }
  | { type: 'viewCreated'; viewId: string; name?: string }
  | { type: 'pageMayExit'; reason: 'visibility_hidden' | 'before_unload' | 'page_frozen' }

export interface RawResourceData {
  url: string
  method?: string
  statusCode?: number
  startClocks: { relative: number; timeStamp: number }
  duration: number
  size?: number
  // Full type expanded during migration
  [key: string]: unknown
}

export interface RawActionData {
  type: string
  name?: string
  startClocks: { relative: number; timeStamp: number }
  duration?: number
  [key: string]: unknown
}

export type RumCoreEvents = {
  resource: RawResourceData
  action: RawActionData
  observation: Observation
  signal: RumSignal
}
