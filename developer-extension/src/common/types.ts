import type { RumEvent } from '../../../packages/rum-core/src/rumEvent.types'
import type { LogsEvent } from '../../../packages/logs/src/logsEvent.types'

export interface BackgroundActions {
  getStore: void
  setStore: Partial<Store>
  flushEvents: void
  endSession: void
}

export interface PopupActions {
  newStore: Store
}

export interface Store {
  devServerStatus: 'unavailable' | 'checking' | 'available'
  useDevBundles: boolean
  useRumSlim: boolean
  logEventsFromRequests: boolean
  blockIntakeRequests: boolean
  local: {
    [tabId: number]: LocalStore
  }
}

export type StoredEvent = (RumEvent | LogsEvent) & {
  id: string
}

export interface LocalStore {
  events: StoredEvent[]
}
