import type { LogsEvent } from '@datadog/browser-logs'
import type { RumEvent } from '@datadog/browser-rum'
import type { TelemetryEvent } from '@datadog/browser-core'
import type { SessionReplayCall } from '../types/serverEvents'
import {
  isTelemetryConfigurationEvent,
  isRumErrorEvent,
  isRumResourceEvent,
  isRumActionEvent,
  isRumViewEvent,
  isTelemetryErrorEvent,
} from '../types/serverEvents'

export type IntakeType = 'logs' | 'rum' | 'sessionReplay' | 'telemetry'

/**
 * Store data sent to the intake and expose helpers to access it.
 */
export class IntakeRegistry {
  readonly rumEvents: RumEvent[] = []
  readonly logsEvents: LogsEvent[] = []
  readonly sessionReplay: SessionReplayCall[] = []
  readonly telemetryEvents: TelemetryEvent[] = []

  push(type: IntakeType, event: any) {
    switch (type) {
      case 'rum':
        this.rumEvents.push(event)
        break
      case 'logs':
        this.logsEvents.push(event)
        break
      case 'telemetry':
        this.telemetryEvents.push(event)
        break
      case 'sessionReplay':
        this.sessionReplay.push(event)
        break
    }
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

  get telemetryErrorEvents() {
    return this.telemetryEvents.filter(isTelemetryErrorEvent)
  }

  get telemetryConfigurationEvents() {
    return this.telemetryEvents.filter(isTelemetryConfigurationEvent)
  }

  get replaySegments() {
    return this.sessionReplay.map((call) => call.segment.data)
  }

  get isEmpty() {
    return (
      this.logsEvents.length + this.rumEvents.length + this.sessionReplay.length + this.telemetryEvents.length === 0
    )
  }

  empty() {
    this.rumEvents.length = 0
    this.telemetryEvents.length = 0
    this.logsEvents.length = 0
  }
}
