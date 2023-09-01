import type { LogsEvent } from '@datadog/browser-logs'
import type { RumEvent } from '@datadog/browser-rum'
import type { TelemetryEvent } from '@datadog/browser-core'
import type { BrowserSegment } from '@datadog/browser-rum/src/types'
import type { BrowserSegmentMetadataAndSegmentSizes } from '@datadog/browser-rum/src/domain/segmentCollection'
import {
  isTelemetryConfigurationEvent,
  isRumEvent,
  isRumErrorEvent,
  isRumResourceEvent,
  isRumActionEvent,
  isRumViewEvent,
  isTelemetryErrorEvent,
  isTelemetryEvent,
} from '../types/serverEvents'

export type LogsIntakeRequest = {
  intakeType: 'logs'
  isBridge: boolean
  events: LogsEvent[]
}

export type RumIntakeRequest = {
  intakeType: 'rum'
  isBridge: boolean
  events: Array<RumEvent | TelemetryEvent>
}

export type ReplayIntakeRequest = {
  intakeType: 'replay'
  isBridge: false
  segment: BrowserSegment
  metadata: BrowserSegmentMetadataAndSegmentSizes
  filename: string
  encoding: string
  mimetype: string
}

export type IntakeRequest = LogsIntakeRequest | RumIntakeRequest | ReplayIntakeRequest

function isLogsIntakeRequest(request: IntakeRequest): request is LogsIntakeRequest {
  return request.intakeType === 'logs'
}

function isRumIntakeRequest(request: IntakeRequest): request is RumIntakeRequest {
  return request.intakeType === 'rum'
}

function isReplayIntakeRequest(request: IntakeRequest): request is ReplayIntakeRequest {
  return request.intakeType === 'replay'
}

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

  //
  // Replay
  //

  get replayRequests() {
    return this.requests.filter(isReplayIntakeRequest)
  }

  get replaySegments() {
    return this.replayRequests.map((request) => request.segment)
  }
}
