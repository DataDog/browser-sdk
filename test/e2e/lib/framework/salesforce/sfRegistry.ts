export interface BridgeEvent {
  type: 'rum' | 'logs' | 'telemetry'
  payload: Record<string, any>
}

export class SfRegistry {
  private events: BridgeEvent[] = []

  add(event: BridgeEvent) {
    this.events.push(event)
  }

  get rumEvents() {
    return this.events.filter((event) => event.type === 'rum').map((event) => event.payload)
  }

  get rumViewEvents() {
    return this.rumEvents.filter((event) => event.type === 'view')
  }

  get rumErrorEvents() {
    return this.rumEvents.filter((event) => event.type === 'error')
  }

  get rumResourceEvents() {
    return this.rumEvents.filter((event) => event.type === 'resource')
  }

  get rumLongTaskEvents() {
    return this.rumEvents.filter((event) => event.type === 'long_task')
  }

  get logsEvents() {
    return this.events.filter((event) => event.type === 'logs').map((event) => event.payload)
  }
}
