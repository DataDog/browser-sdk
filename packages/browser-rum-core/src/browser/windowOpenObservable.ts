import { instrumentMethod } from '@datadog/browser-core'
import { globalObject, noop, Observable } from '@datadog/js-core/util'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const window = globalObject.window
  if (!window) {
    return { observable, stop: noop }
  }
  const { stop } = instrumentMethod(window, 'open', () => observable.notify())
  return { observable, stop }
}
