import {
  AnyServerEvent,
  isRumErrorEvent,
  isRumResourceEvent,
  isRumUserActionEvent,
  isRumViewEvent,
  ServerInternalMonitoringMessage,
  ServerLogsMessage,
  ServerRumEvent,
} from './serverTypes'

type IntakeType = 'logs' | 'rum' | 'internalMonitoring'

interface Entry {
  type: IntakeType
  event: AnyServerEvent
}

export class EventRegistry {
  private db: Entry[] = []

  push(type: IntakeType, event: AnyServerEvent) {
    this.db.push({ type, event })
  }

  get all() {
    return this.db.map((entry) => entry.event)
  }

  get logs() {
    return this.getEvents('logs')
  }

  get rum() {
    return this.getEvents('rum')
  }

  get internalMonitoring() {
    return this.getEvents('internalMonitoring')
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
    this.db.length = 0
  }

  private getEvents(type: 'rum'): ServerRumEvent[]
  private getEvents(type: 'logs'): ServerLogsMessage[]
  private getEvents(type: 'internalMonitoring'): ServerInternalMonitoringMessage[]
  private getEvents(type: IntakeType) {
    return this.db.filter((entry) => entry.type === type).map((entry) => entry.event)
  }
}
