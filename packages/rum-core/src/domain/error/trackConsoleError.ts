import type { Observable, RawError } from '@datadog/browser-core'
import { initConsoleObservable, ConsoleApiName } from '@datadog/browser-core'

export function trackConsoleError(errorObservable: Observable<RawError>) {
  const subscription = initConsoleObservable([ConsoleApiName.error]).subscribe((consoleLog) =>
    errorObservable.notify(consoleLog.error)
  )

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
