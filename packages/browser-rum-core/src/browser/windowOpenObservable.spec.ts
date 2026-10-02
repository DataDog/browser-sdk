import { vi, describe, expect, it } from 'vitest'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createWindowOpenObservable } from './windowOpenObservable'

describe('windowOpenObservable', () => {
  it('should notify observer on `window.open` call', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = window.open
    window.open = vi.fn()
    const spy = vi.fn()

    const { observable, stop } = createWindowOpenObservable()
    const { unsubscribe } = observable.subscribe(spy)

    registerCleanupTask(() => {
      unsubscribe()
      stop()
      window.open = original
    })

    window.open()

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
