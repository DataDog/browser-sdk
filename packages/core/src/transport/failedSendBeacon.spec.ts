import { resetExperimentalFeatures, updateExperimentalFeatures } from '../domain/configuration'
import { addFailedSendBeacon, startFlushFailedSendBeacons } from './failedSendBeacon'

describe('failedSendBeacon', () => {
  afterEach(() => {
    resetExperimentalFeatures()
    window.localStorage.clear()
  })

  describe('when ff lower-batch-size enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['lower-batch-size'])
    })

    it('should flush failed sendBeacon ', () => {
      addFailedSendBeacon('foo', 100)
      startFlushFailedSendBeacons()
      expect(window.localStorage.getItem('failed-send-beacon')).toEqual(null)
    })

    it('should add failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)
      const failedSendBeacons = JSON.parse(window.localStorage.getItem('failed-send-beacon') || '[]')
      expect(failedSendBeacons.length).toEqual(1)
    })
  })

  describe('when ff lower-batch-size disabled', () => {
    it('should not flush failed sendBeacon ', () => {
      startFlushFailedSendBeacons()
      expect(spyOn(window.localStorage, 'clear')).not.toHaveBeenCalled()
    })

    it('should not add failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)
      expect(window.localStorage.getItem('failed-send-beacon')).toEqual(null)
    })
  })
})
