import { addTelemetryDebug } from '../domain/telemetry'
import { isExperimentalFeatureEnabled } from '../domain/configuration'

let untrustedEventsCounter = 0
export const listenerWithTelemetry =
  (fn: (e: Event) => void, counter = untrustedEventsCounter, telemetryCallback = addTelemetryDebug) =>
  (e: Event) => {
    if (isExperimentalFeatureEnabled('log_untrusted_events') && counter < 3 && !e.isTrusted) {
      telemetryCallback('Untrusted event', {
        eventType: e.type,
      })
      untrustedEventsCounter++
    }
    fn(e)
  }
