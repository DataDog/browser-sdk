import { createNewEvent, registerCleanupTask } from '@openobserve/browser-core/test'
import { onBFCacheRestore } from './bfCacheSupport'

describe('onBFCacheRestore', () => {
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
