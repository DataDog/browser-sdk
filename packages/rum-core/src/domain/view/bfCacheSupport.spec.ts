import { vi } from 'vitest'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../test'
import { onBFCacheRestore } from './bfCacheSupport'

describe('onBFCacheRestore', () => {
  it('should invoke the callback only for BFCache restoration and stop listening when stopped', () => {
    const configuration = mockRumConfiguration()
    const callback = vi.fn()

    const stop = onBFCacheRestore(configuration, callback)
    registerCleanupTask(stop)

    window.dispatchEvent(createNewEvent('pageshow', { persisted: false }))
    expect(callback).not.toHaveBeenCalled()

    window.dispatchEvent(createNewEvent('pageshow', { persisted: true }))
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
