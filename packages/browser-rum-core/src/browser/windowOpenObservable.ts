import { instrumentMethod } from '@datadog/browser-core'
import { globalObject, noop, Observable } from '@datadog/js-core/util'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const window = globalObject.window
  const { stop } = window ? instrumentMethod(window, 'open', () => observable.notify()) : { stop: noop }
  return { observable, stop }
}
