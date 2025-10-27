import { clocksNow, type RelativeTime } from '@datadog/browser-core'
import { cleanupLongTaskRegistryAfterCollection, getLongTaskId, setLongTaskId } from './longTaskRegistry'

describe('longTaskRegistry', () => {
  const startTime = 12345 as RelativeTime

  beforeEach(() => {
    cleanupLongTaskRegistryAfterCollection(clocksNow().relative)
  })

  it('should set and get long task id', () => {
    setLongTaskId('1', startTime)
    expect(getLongTaskId(startTime)).toBe('1')
  })

  it('should cleanup long task registry after collection', () => {
    setLongTaskId('1', startTime)
    const collectionRelativeTime = (startTime + 1000) as RelativeTime
    cleanupLongTaskRegistryAfterCollection(collectionRelativeTime)
    // Check that the long task id is not in the registry anymore, it should have been cleaned-up.
    expect(getLongTaskId(startTime)).toBeUndefined()

    // Now add a new long task id, and check that it is not cleaned-up.
    const afterCollectionStartTime = (startTime + 1500) as RelativeTime
    setLongTaskId('1', afterCollectionStartTime)
    // Clean-up with a time that is before the new long task id, so it should not be cleaned-up.
    cleanupLongTaskRegistryAfterCollection(collectionRelativeTime)
    // Expect the long task id to still be in the registry.
    expect(getLongTaskId(afterCollectionStartTime)).toBe('1')
  })
})
