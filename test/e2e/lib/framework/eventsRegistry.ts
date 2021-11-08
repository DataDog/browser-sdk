import { LogsEvent } from '@datadog/browser-logs'
import { RumEvent } from '@datadog/browser-rum'
import {
  isRumErrorEvent,
  isRumResourceEvent,
  isRumUserActionEvent,
  isRumViewEvent,
  SessionReplayCall,
  ServerInternalMonitoringMessage,
} from '../types/serverEvents'

type IntakeType = 'logs' | 'rum' | 'internalMonitoring' | 'sessionReplay'

export class EventRegistry {
  readonly rum: RumEvent[] = []
  readonly logs: LogsEvent[] = []
  readonly sessionReplay: SessionReplayCall[] = []
  readonly internalMonitoring: ServerInternalMonitoringMessage[] = []

  push(type: IntakeType, event: any) {
    this[type].push(event)
  }

  get count() {
    return this.logs.length + this.rum.length + this.internalMonitoring.length + this.sessionReplay.length
  }

  get rumActions() {
    return this.rum.filter(isRumUserActionEvent)
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
    this.logs.length = 0
  }
}
