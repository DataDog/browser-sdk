import { mockClock } from '../../test/specHelper'
import { ONE_SECOND } from '../tools/utils'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '../domain/configuration'
import { addFailedSendBeacon, LOCAL_STORAGE_KEY, startFlushFailedSendBeacons } from './failedSendBeacon'

describe('failedSendBeacon', () => {
  afterEach(() => {
    resetExperimentalFeatures()
    window.localStorage.clear()
  })

  describe('when ff lower-batch-size enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['lower-batch-size'])
    })

    it('should flush failed sendBeacon after 2 second', () => {
      const clock = mockClock()

      addFailedSendBeacon('foo', 100)
      startFlushFailedSendBeacons()
      clock.tick(2 * ONE_SECOND)
      expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toEqual(null)
      clock.cleanup()
    })

    it('should add failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)
      const failedSendBeacons = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY) || '[]')
      expect(failedSendBeacons.length).toEqual(1)
    })
  })

  describe('when ff lower-batch-size disabled', () => {
    it('should not flush failed sendBeacon ', () => {
      startFlushFailedSendBeacons()
      expect(spyOn(window.localStorage, 'removeItem')).not.toHaveBeenCalled()
    })

    it('should not add failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)
      expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toEqual(null)
    })
  })
})
