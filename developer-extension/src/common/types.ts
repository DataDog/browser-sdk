import type { TelemetryEvent } from '../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../packages/rum-core/src/rumEvent.types'
import type { BrowserRecord, BrowserSegmentMetadata } from '../../../packages/rum/src/types'

export type BackgroundToDevtoolsMessage = {
  type: 'sdk-message'
  message: SdkMessage
}

export type SdkMessage =
  | {
      type: 'logs'
      payload: LogsEvent
    }
  | {
      type: 'rum'
      payload: RumEvent
    }
  | {
      type: 'telemetry'
      payload: TelemetryEvent
    }
  | {
      type: 'record'
      payload: {
        record: BrowserRecord
        segment: BrowserSegmentMetadata
      }
    }

export interface BackgroundActions {
  getStore: void
  setStore: Partial<Store>
}

export interface PopupActions {
  newStore: Store
}

export interface Store {
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
}
