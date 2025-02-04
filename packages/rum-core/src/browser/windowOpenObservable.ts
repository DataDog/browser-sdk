import { instrumentMethod, Observable } from '@datadog/browser-core'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const { stop } = instrumentMethod(window, 'open', () => observable.notify())
  return { observable, stop }
}
