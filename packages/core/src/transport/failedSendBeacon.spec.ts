import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import { startsWith } from '../tools/utils'
import type { Configuration } from '../domain/configuration'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '../domain/configuration'
import type { MonitoringMessage } from '../domain/internalMonitoring'
import { resetInternalMonitoring, startInternalMonitoring } from '../domain/internalMonitoring'
import { addFailedSendBeacon, LOCAL_STORAGE_KEY, startFlushFailedSendBeacons } from './failedSendBeacon'

describe('failedSendBeacon', () => {
  let clock: Clock
  let notifyLogSpy: jasmine.Spy<(message: MonitoringMessage) => void>

  beforeEach(() => {
    const { monitoringMessageObservable } = startInternalMonitoring({
      maxInternalMonitoringMessagesPerPage: 1,
      telemetrySampleRate: 100,
    } as Configuration)
    notifyLogSpy = jasmine.createSpy('notified')
    monitoringMessageObservable.subscribe(notifyLogSpy)
    clock = mockClock()
  })

  afterEach(() => {
    resetExperimentalFeatures()
    resetInternalMonitoring()
    window.localStorage.clear()
    clock.cleanup()
  })

  describe('when ff lower-batch-size enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['lower-batch-size'])
    })

    it('should flush failed sendBeacon asynchronously', () => {
      addFailedSendBeacon('foo', 100, 'before_unload')
      startFlushFailedSendBeacons()
      clock.tick(0)

      expect(localStorageFailedBeacon()).toEqual(0)
      expect(notifyLogSpy).toHaveBeenCalled()
    })

    it('should add failed sendBeacon to the local storage when reason is unload', () => {
      addFailedSendBeacon('foo', 100, 'before_unload')
      addFailedSendBeacon('foo', 100, 'visibility_hidden')

      expect(localStorageFailedBeacon()).toEqual(2)
      expect(notifyLogSpy).not.toHaveBeenCalled()
    })

    it('should send failed sendBeacon log when reason is not unload', () => {
      addFailedSendBeacon('foo', 100)

      expect(localStorageFailedBeacon()).toEqual(0)
      expect(notifyLogSpy).toHaveBeenCalled()
    })
  })

  describe('when ff lower-batch-size disabled', () => {
    it('should not flush failed sendBeacon asynchronously', () => {
      startFlushFailedSendBeacons()
      clock.tick(0)

      expect(spyOn(window.localStorage, 'removeItem')).not.toHaveBeenCalled()
    })

    it('should not send failed sendBeacon', () => {
      addFailedSendBeacon('foo', 100)

      expect(localStorageFailedBeacon()).toEqual(0)
      expect(notifyLogSpy).not.toHaveBeenCalled()
    })

    it('should not add failed sendBeacon to the local storage when reason is unload', () => {
      addFailedSendBeacon('foo', 100, 'before_unload')
      addFailedSendBeacon('foo', 100, 'visibility_hidden')

      expect(localStorageFailedBeacon()).toEqual(0)
      expect(notifyLogSpy).not.toHaveBeenCalled()
    })
  })
})

function localStorageFailedBeacon() {
  return Object.keys(window.localStorage).filter((key) => startsWith(key, LOCAL_STORAGE_KEY)).length
}
