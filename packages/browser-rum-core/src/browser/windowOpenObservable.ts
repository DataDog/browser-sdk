import { instrumentMethod } from '@datadog/browser-core'
import { globalObject, Observable } from '@datadog/js-core/util'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const { stop } = instrumentMethod(globalObject.window, 'open', () => observable.notify())
  return { observable, stop }
}
