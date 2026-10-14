import { createNewEvent, registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import { onBFCacheRestore } from './bfCacheSupport'

describe('onBFCacheRestore', () => {
  it('does not listen for page restoration without a window', () => {
    replaceMockable(globalObject.window, undefined)
    const callback = jasmine.createSpy()
    const stop = onBFCacheRestore(callback)

    window.dispatchEvent(createNewEvent('pageshow', { persisted: true }))

    expect(callback).not.toHaveBeenCalled()
    stop()
  })

  it('should invoke the callback only for BFCache restoration and stop listening when stopped', () => {
    const callback = jasmine.createSpy('callback')

    const stop = onBFCacheRestore(callback)
    registerCleanupTask(stop)

    window.dispatchEvent(createNewEvent('pageshow', { persisted: false }))
    expect(callback).not.toHaveBeenCalled()

    window.dispatchEvent(createNewEvent('pageshow', { persisted: true }))
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
