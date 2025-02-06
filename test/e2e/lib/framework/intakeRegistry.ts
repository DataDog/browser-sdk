import type { LogsEvent } from '@datadog/browser-logs'
import type {
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumResourceEvent,
  RumViewEvent,
  RumVitalEvent,
} from '@datadog/browser-rum'
import type {
  TelemetryEvent,
  TelemetryErrorEvent,
  TelemetryConfigurationEvent,
  TelemetryUsageEvent,
} from '@datadog/browser-core'
import type { BrowserSegment } from '@datadog/browser-rum/src/types'
import type { BrowserSegmentMetadataAndSegmentSizes } from '@datadog/browser-rum/src/domain/segmentCollection'

type BaseIntakeRequest = {
  isBridge: boolean
  encoding: string | null
}

export type LogsIntakeRequest = {
  intakeType: 'logs'
  events: LogsEvent[]
} & BaseIntakeRequest

export type RumIntakeRequest = {
  intakeType: 'rum'
  events: Array<RumEvent | TelemetryEvent>
} & BaseIntakeRequest

export type ReplayIntakeRequest = {
  intakeType: 'replay'
  segment: BrowserSegment
  metadata: BrowserSegmentMetadataAndSegmentSizes
  segmentFile: {
    filename: string
    encoding: string
    mimetype: string
  }
} & BaseIntakeRequest

export type IntakeRequest = LogsIntakeRequest | RumIntakeRequest | ReplayIntakeRequest

/**
 * Store data sent to the intake and expose helpers to access it.
 */
export class IntakeRegistry {
  readonly requests: IntakeRequest[] = []

  push(request: IntakeRequest) {
    this.requests.push(request)
  }

  get isEmpty() {
    return this.requests.length === 0
  }

  empty() {
    this.requests.length = 0
  }

  get hasOnlyBridgeRequests() {
    return this.requests.every((request) => request.isBridge)
  }

  //
  // Logs
  //

  get logsRequests() {
    return this.requests.filter(isLogsIntakeRequest)
  }

  get logsEvents() {
    return this.logsRequests.flatMap((request) => request.events)
  }

  //
  // RUM
  //

  get rumRequests() {
    return this.requests.filter(isRumIntakeRequest)
  }

  get rumEvents() {
    return this.rumRequests.flatMap((request) => request.events.filter(isRumEvent))
  }

  get rumActionEvents() {
    return this.rumEvents.filter(isRumActionEvent)
  }

  get rumErrorEvents() {
    return this.rumEvents.filter(isRumErrorEvent)
  }

  get rumResourceEvents() {
    return this.rumEvents.filter(isRumResourceEvent)
  }

  get rumViewEvents() {
    return this.rumEvents.filter(isRumViewEvent)
  }

  get rumVitalEvents() {
    return this.rumEvents.filter(isRumVitalEvent)
  }

  //
  // Telemetry
  //

  get telemetryEvents() {
    return this.rumRequests.flatMap((request) => request.events.filter(isTelemetryEvent))
  }

  get telemetryErrorEvents() {
    return this.telemetryEvents.filter(isTelemetryErrorEvent)
  }

  get telemetryConfigurationEvents() {
    return this.telemetryEvents.filter(isTelemetryConfigurationEvent)
  }

  get telemetryUsageEvents() {
    return this.telemetryEvents.filter(isTelemetryUsageEvent)
  }

  //
  // Replay
  //

  get replayRequests() {
    return this.requests.filter(isReplayIntakeRequest)
  }

  get replaySegments() {
    return this.replayRequests.map((request) => request.segment)
  }

  get replayRecords() {
    return this.replayRequests.flatMap((request) => request.segment.records)
  }
}

function isLogsIntakeRequest(request: IntakeRequest): request is LogsIntakeRequest {
  return request.intakeType === 'logs'
}

function isRumIntakeRequest(request: IntakeRequest): request is RumIntakeRequest {
  return request.intakeType === 'rum'
}

function isReplayIntakeRequest(request: IntakeRequest): request is ReplayIntakeRequest {
  return request.intakeType === 'replay'
}

function isRumEvent(event: RumEvent | TelemetryEvent): event is RumEvent {
  return !isTelemetryEvent(event)
}

function isRumResourceEvent(event: RumEvent): event is RumResourceEvent {
  return event.type === 'resource'
}

function isRumActionEvent(event: RumEvent): event is RumActionEvent {
  return event.type === 'action'
}

function isRumViewEvent(event: RumEvent): event is RumViewEvent {
  return event.type === 'view'
}

function isRumErrorEvent(event: RumEvent): event is RumErrorEvent {
  return event.type === 'error'
}

function isRumVitalEvent(event: RumEvent): event is RumVitalEvent {
  return event.type === 'vital'
}

function isTelemetryEvent(event: RumEvent | TelemetryEvent): event is TelemetryEvent {
  return event.type === 'telemetry'
}

function isTelemetryErrorEvent(event: TelemetryEvent): event is TelemetryErrorEvent {
  return isTelemetryEvent(event) && event.telemetry.status === 'error'
}

function isTelemetryConfigurationEvent(event: TelemetryEvent): event is TelemetryConfigurationEvent {
  return isTelemetryEvent(event) && event.telemetry.type === 'configuration'
}

function isTelemetryUsageEvent(event: TelemetryEvent): event is TelemetryUsageEvent {
  return isTelemetryEvent(event) && event.telemetry.type === 'usage'
}
