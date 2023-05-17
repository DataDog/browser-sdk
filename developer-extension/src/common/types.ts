import type { TelemetryEvent } from '../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../packages/rum-core/src/rumEvent.types'
import type { BrowserRecord, BrowserSegmentMetadata } from '../../../packages/rum/src/types'

export type BackgroundToDevtoolsMessage = {
  type: 'sdk-message'
  message: SdkMessage
}

export type DevtoolsToBackgroundMessage = {
  type: 'update-net-request-rules'
  options: NetRequestRulesOptions
}

export interface NetRequestRulesOptions {
  tabId: number
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
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
