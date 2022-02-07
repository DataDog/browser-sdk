import type { Observable, RawError } from '@datadog/browser-core'
import { clocksNow, ErrorHandling, initConsoleObservable } from '@datadog/browser-core'

export function trackConsoleError(errorObservable: Observable<RawError>) {
  const subscription = initConsoleObservable(['error']).subscribe((consoleError) =>
    errorObservable.notify({
      startClocks: clocksNow(),
      message: consoleError.message,
      stack: consoleError.stack,
      source: consoleError.source,
      handling: ErrorHandling.HANDLED,
      handlingStack: consoleError.handlingStack,
    })
  )

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
