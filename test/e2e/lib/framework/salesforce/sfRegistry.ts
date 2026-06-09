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

  get rumUniqueViewEvents() {
    const viewsById = new Map<string, Record<string, any>>()
    for (const event of this.rumViewEvents) {
      const viewId = event.view?.id
      if (viewId) {
        viewsById.set(viewId, event)
      }
    }
    return [...viewsById.values()]
  }

  get rumActionEvents() {
    return this.rumEvents.filter((event) => event.type === 'action')
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
