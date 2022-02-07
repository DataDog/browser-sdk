import type { Observable, RawError } from '@datadog/browser-core'
import { ErrorHandling, initConsoleObservable } from '@datadog/browser-core'

export function trackConsoleError(errorObservable: Observable<RawError>) {
  const subscription = initConsoleObservable(['error']).subscribe((consoleError) =>
    errorObservable.notify({
      startClocks: consoleError.startClocks,
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
