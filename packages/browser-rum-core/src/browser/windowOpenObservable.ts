import { instrumentMethod } from '@datadog/browser-core'
import { Observable } from '@datadog/js-core/util'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const { stop } = instrumentMethod(window, 'open', () => observable.notify())
  return { observable, stop }
}
