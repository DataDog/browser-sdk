import { instrumentMethod, Observable } from '@datadog/browser-core'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  instrumentMethod(window, 'open', () => {
    observable.notify()
  })
  return observable
}
