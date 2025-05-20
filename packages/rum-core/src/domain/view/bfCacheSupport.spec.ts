import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { onBFCacheRestore } from './bfCacheSupport'

describe('onBFCacheRestore', () => {
  it('should invoke the callback only for BFCache restoration and stop listening when stopped', () => {
    const configuration = mockRumConfiguration()
    const callback = jasmine.createSpy('callback')

    const stop = onBFCacheRestore(configuration, callback)

    window.dispatchEvent(createNewEvent('pageshow', { persisted: false } as Partial<PageTransitionEvent>))
    expect(callback).not.toHaveBeenCalled()

    window.dispatchEvent(createNewEvent('pageshow', { persisted: true } as Partial<PageTransitionEvent>))
    expect(callback).toHaveBeenCalledTimes(1)

    registerCleanupTask(stop)
  })
})
