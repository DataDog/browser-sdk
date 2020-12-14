import { LogsEvent } from '@datadog/browser-logs'
import { RumEvent } from '@datadog/browser-rum'
import {
  isRumErrorEvent,
  isRumResourceEvent,
  isRumUserActionEvent,
  isRumViewEvent,
  ServerInternalMonitoringMessage,
} from '../types/serverEvents'

type IntakeType = 'logs' | 'rum' | 'internalMonitoring'

export class EventRegistry {
  readonly rum: RumEvent[] = []
  readonly logs: LogsEvent[] = []
  readonly internalMonitoring: ServerInternalMonitoringMessage[] = []

  push(type: IntakeType, event: any) {
    // tslint:disable-next-line: no-unsafe-any
    this[type].push(event)
  }

  get count() {
    return this.logs.length + this.rum.length + this.internalMonitoring.length
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
