import { instrumentMethod, Observable } from '@datadog/browser-core'

export function createWindowOpenObservable() {
  return new Observable<void>((observable) => {
    const { stop } = instrumentMethod(window, 'open', () => {
      observable.notify()
    })
    return stop
  })
}
