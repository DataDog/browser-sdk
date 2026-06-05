export interface BridgeEvent {
  type: 'rum' | 'logs' | 'telemetry'
  payload: Record<string, unknown>
}

export class SfRegistry {
  private _events: BridgeEvent[] = []

  load(events: BridgeEvent[]) {
    this._events = events
  }

  get rumEvents() {
    return this._events.filter((e) => e.type === 'rum').map((e) => e.payload)
  }

  get rumViewEvents() {
    return this.rumEvents.filter((e) => e['type'] === 'view')
  }

  // Deduplicated by view.id, keeping the latest event per view (SDK sends multiple updates per view)
  get rumUniqueViewEvents() {
    const byId = new Map<string, Record<string, unknown>>()
    for (const event of this.rumViewEvents) {
      const id = event['view']?.['id'] as string
      if (id) byId.set(id, event)
    }
    return [...byId.values()]
  }

  get rumActionEvents() {
    return this.rumEvents.filter((e) => e['type'] === 'action')
  }

  get rumErrorEvents() {
    return this.rumEvents.filter((e) => e['type'] === 'error')
  }

  get rumResourceEvents() {
    return this.rumEvents.filter((e) => e['type'] === 'resource')
  }

  get rumLongTaskEvents() {
    return this.rumEvents.filter((e) => e['type'] === 'long_task')
  }

  get logsEvents() {
    return this._events.filter((e) => e.type === 'logs').map((e) => e.payload)
  }
}

// Injected via page.addInitScript() — runs in the real top-level window before LWS boots.
// The SDK (inside the LWS sandbox) reads globalThis.__ddBrowserSdkExtensionCallback; the LWS
// proxy forwards unknown-property reads to the real global, so it finds this callback.
export const BRIDGE_INIT_SCRIPT = `
  window.__ddBrowserSdkExtensionCallback = function(msg) {
    window.__ddSfTestEvents = window.__ddSfTestEvents || [];
    window.__ddSfTestEvents.push(msg);
  };
`
