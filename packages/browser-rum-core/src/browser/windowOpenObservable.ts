import { instrumentMethod } from '@datadog/browser-core'
import { globalObject, mockable, noop, Observable } from '@datadog/js-core/util'

export function createWindowOpenObservable() {
  const observable = new Observable<void>()
  const window = mockable(globalObject.window)
  const { stop } = window ? instrumentMethod(window, 'open', () => observable.notify()) : { stop: noop }
  return { observable, stop }
}
