import type { Observable, RawError } from '@datadog/browser-core'
import { clocksNow, ErrorHandling, initConsoleObservable, ErrorSource, ConsoleApiName } from '@datadog/browser-core'

export function trackConsoleError(errorObservable: Observable<RawError>) {
  const subscription = initConsoleObservable([ConsoleApiName.error]).subscribe((consoleError) =>
    errorObservable.notify({
      startClocks: clocksNow(),
      message: consoleError.message,
      stack: consoleError.stack,
      fingerprint: consoleError.fingerprint,
      source: ErrorSource.CONSOLE,
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
