import { startMonitorErrorCollection } from '../../src/tools/monitor'
import {
  addTelemetryError,
  getTelemetryObservable,
  resetTelemetry,
  type RawTelemetryEvent,
} from '../../src/domain/telemetry'

export interface MockTelemetry {
  getEvents: () => Promise<RawTelemetryEvent[]>
  hasEvents: () => Promise<boolean>
  reset: () => void
}

export function startMockTelemetry() {
  resetTelemetry()
  const events: RawTelemetryEvent[] = []

  const telemetryObservable = getTelemetryObservable()
  telemetryObservable.subscribe(({ rawEvent }) => {
    events.push(rawEvent)
  })
  telemetryObservable.unbuffer()

  startMonitorErrorCollection(addTelemetryError)

  function getEvents() {
    // Using a Promise to ensure the consumer waits after the next microtask so events are collected
    return Promise.resolve(events)
  }

  return {
    getEvents,
    hasEvents: () => getEvents().then((events) => events.length > 0),
    reset: () => {
      events.length = 0
    },
  }
}
