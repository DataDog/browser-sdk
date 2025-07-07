import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { startExposureCollection } from './exposureCollection'

describe('exposureCollection', () => {
  let lifeCycle: LifeCycle
  let trackExposure: ReturnType<typeof startExposureCollection>['trackExposure']

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    ;({ trackExposure } = startExposureCollection(lifeCycle))
  })

  describe('trackExposure', () => {
    it('should notify exposure collected event', () => {
      const notifySpy = spyOn(lifeCycle, 'notify')

      trackExposure('flag_key', 'flag_value')

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'flag_key',
          flag_value: 'flag_value',
        })
      )
    })

    it('should include options in the event', () => {
      const notifySpy = spyOn(lifeCycle, 'notify')
      const options = { context: { foo: 'bar' } }

      trackExposure('flag_key', 'flag_value', options)

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'flag_key',
          flag_value: 'flag_value',
          foo: 'bar',
        })
      )
    })

    it('should handle different flag value types', () => {
      const notifySpy = spyOn(lifeCycle, 'notify')

      trackExposure('boolean_flag', true)
      trackExposure('number_flag', 42)
      trackExposure('object_flag', { nested: 'value' })

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'boolean_flag',
          flag_value: true,
        })
      )

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'number_flag',
          flag_value: 42,
        })
      )

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'object_flag',
          flag_value: { nested: 'value' },
        })
      )
    })

    it('should handle empty options', () => {
      const notifySpy = spyOn(lifeCycle, 'notify')

      trackExposure('flag_key', 'flag_value', {})

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'flag_key',
          flag_value: 'flag_value',
        })
      )
    })

    it('should handle undefined options', () => {
      const notifySpy = spyOn(lifeCycle, 'notify')

      trackExposure('flag_key', 'flag_value', undefined)

      expect(notifySpy).toHaveBeenCalledWith(
        LifeCycleEventType.EXPOSURE_COLLECTED,
        jasmine.objectContaining({
          flag_key: 'flag_key',
          flag_value: 'flag_value',
        })
      )
    })
  })
}) 