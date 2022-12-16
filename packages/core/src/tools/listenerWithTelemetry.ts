import { addTelemetryDebug } from '../domain/telemetry'
import { isExperimentalFeatureEnabled } from '../domain/configuration'

let untrustedEventsCounter = 0
export const listenerWithTelemetry =
  (fn: (e: Event) => void, counter = untrustedEventsCounter, telemetryCallback = addTelemetryDebug) =>
  (e: Event) => {
    if (
      isExperimentalFeatureEnabled('log_untrusted_events') &&
      !isLegitimateUseCase(event) &&
      counter < 3 &&
      !e.isTrusted
    ) {
      telemetryCallback('Untrusted event', {
        eventType: e.type,
      })
      untrustedEventsCounter++
    }
    fn(e)
  }

interface BrowserWindow {
  DD_ENV?: string
  jasmine?: any
}

// TODO: ignore "pointerdown" events from on mobile-SDK
// https://github.com/DataDog/dd-sdk-android/blob/6c6af82decf319fb812071be25c0dd776b4c234b/instrumented/nightly-tests/src/androidTest/kotlin/com/datadog/android/nightly/webview/WebViewTrackingE2ETests.kt#L107
const isLegitimateUseCase = (event?: Event) => {
  const browserWindow = window as BrowserWindow
  if (
    (event && event.type === 'beforeunload') || // we recommend to use 'beforeunload' to flush events
    browserWindow?.DD_ENV === 'test' || // running e2e test
    (browserWindow && !browserWindow?.jasmine) // running unit test
  ) {
    return true
  }
  return false
}
