import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import { startsWith } from '../tools/utils'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '../domain/configuration'
import { addFailedSendBeacon, LOCAL_STORAGE_KEY, startFlushFailedSendBeacons } from './failedSendBeacon'

describe('failedSendBeacon', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    resetExperimentalFeatures()
    window.localStorage.clear()
    clock.cleanup()
  })

  describe('when ff lower-batch-size enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['lower-batch-size'])
    })

    it('should flush failed sendBeacon asynchronously', () => {
      addFailedSendBeacon('foo', 100)
      startFlushFailedSendBeacons()
      clock.tick(0)
      expect(localStorageHasFailedBeacon()).toEqual(false)
    })

    it('should add failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)
      expect(localStorageHasFailedBeacon()).toEqual(true)
    })
  })

  describe('when ff lower-batch-size disabled', () => {
    it('should not flush failed sendBeacon asynchronously', () => {
      startFlushFailedSendBeacons()
      clock.tick(0)
      expect(spyOn(window.localStorage, 'removeItem')).not.toHaveBeenCalled()
    })

    it('should not add failed sendBeacon', () => {
      window.localStorage.clear()
      addFailedSendBeacon('foo', 100)
      expect(localStorageHasFailedBeacon()).toEqual(false)
    })
  })
})

function localStorageHasFailedBeacon() {
  return Object.keys(window.localStorage).some((key) => startsWith(key, LOCAL_STORAGE_KEY))
}
