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

export type DevBundlesOverride = false | 'cdn' | 'npm'

export interface NetRequestRulesOptions {
  tabId: number
  useDevBundles: DevBundlesOverride
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

export type EventCollectionStrategy = 'sdk' | 'requests'

export interface Settings {
  useDevBundles: DevBundlesOverride
  useRumSlim: boolean
  blockIntakeRequests: boolean
  autoFlush: boolean
  preserveEvents: boolean
  eventCollectionStrategy: EventCollectionStrategy
  rumConfigurationOverride: object | null
  logsConfigurationOverride: object | null
}
