import type { RelativeTime, TimeStamp } from '@datadog/js-core/time'
import { globalObject, noop } from '@datadog/js-core/util'
import { registerCleanupTask } from '../../../test'
import type { EarlyCollectionGlobal } from './earlyCollection'
import { EARLY_COLLECTION_GLOBAL_NAME, readEarlyCollection } from './earlyCollection'

describe('readEarlyCollection', () => {
  function setEarlyCollection(value: unknown) {
    ;(globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME] = value
    registerCleanupTask(() => {
      delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
    })
  }

  function validEarlyCollection(): EarlyCollectionGlobal {
    return {
      version: 1,
      startClocks: { relative: 1 as RelativeTime, timeStamp: 2 as TimeStamp },
      buffer: [],
      profiler: undefined,
      stop: noop,
    }
  }

  it('returns the global when it is present and valid', () => {
    const earlyCollection = validEarlyCollection()
    setEarlyCollection(earlyCollection)

    expect(readEarlyCollection()).toBe(earlyCollection)
  })

  it('returns undefined when the global is absent', () => {
    expect(readEarlyCollection()).toBeUndefined()
  })

  it('returns undefined when the contract version is not recognized', () => {
    setEarlyCollection({ ...validEarlyCollection(), version: 2 })

    expect(readEarlyCollection()).toBeUndefined()
  })

  it('returns undefined when the global shape is invalid', () => {
    setEarlyCollection({ ...validEarlyCollection(), buffer: 'not an array' })
    expect(readEarlyCollection()).toBeUndefined()

    setEarlyCollection({ ...validEarlyCollection(), stop: 'not a function' })
    expect(readEarlyCollection()).toBeUndefined()

    setEarlyCollection('not an object')
    expect(readEarlyCollection()).toBeUndefined()
  })
})
