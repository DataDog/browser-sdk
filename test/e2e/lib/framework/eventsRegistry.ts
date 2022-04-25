import type { LogsEvent } from '@datadog/browser-logs'
import type { RumEvent } from '@datadog/browser-rum'
import type { TelemetryEvent } from '@datadog/browser-core'
import type { SessionReplayCall, ServerInternalMonitoringMessage } from '../types/serverEvents'
import { isRumErrorEvent, isRumResourceEvent, isRumActionEvent, isRumViewEvent } from '../types/serverEvents'

export type IntakeType = 'logs' | 'rum' | 'internalMonitoring' | 'sessionReplay' | 'telemetry'

export class EventRegistry {
  readonly rum: RumEvent[] = []
  readonly logs: LogsEvent[] = []
  readonly sessionReplay: SessionReplayCall[] = []
  readonly internalMonitoring: ServerInternalMonitoringMessage[] = []
  readonly telemetry: TelemetryEvent[] = []

  push(type: IntakeType, event: any) {
    this[type].push(event)
  }

  get count() {
    return (
      this.logs.length +
      this.rum.length +
      this.internalMonitoring.length +
      this.sessionReplay.length +
      this.telemetry.length
    )
  }

  get rumActions() {
    return this.rum.filter(isRumActionEvent)
  }

  get rumErrors() {
    return this.rum.filter(isRumErrorEvent)
  }

  get rumResources() {
    return this.rum.filter(isRumResourceEvent)
  }

  get rumViews() {
    return this.rum.filter(isRumViewEvent)
  }

  empty() {
    this.rum.length = 0
    this.internalMonitoring.length = 0
    this.telemetry.length = 0
    this.logs.length = 0
  }
}
