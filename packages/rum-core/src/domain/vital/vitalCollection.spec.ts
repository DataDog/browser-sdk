import { clocksNow } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import { startVitalCollection } from './vitalCollection'

describe('vitalCollection', () => {
  let setupBuilder: TestSetupBuilder
  let vitalCollection: ReturnType<typeof startVitalCollection>

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle }) => {
        vitalCollection = startVitalCollection(lifeCycle)
      })
  })

  describe('custom duration', () => {
    it('should create duration vital from start/stop API', () => {
      const { rawRumEvents, clock } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.custom.foo).toBe(100)
    })

    it('should not create duration vital without calling the stop API', () => {
      const { rawRumEvents } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(0)
    })

    it('should not create duration vital without calling the start API', () => {
      const { rawRumEvents } = setupBuilder.build()

      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(0)
    })

    it('should create multiple duration vitals from start/stop API', () => {
      const { rawRumEvents, clock } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.startDurationVital({ name: 'bar', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.stopDurationVital({ name: 'bar', stopClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(2)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.custom.bar).toBe(100)
      expect((rawRumEvents[1].rawRumEvent as RawRumVitalEvent).vital.custom.foo).toBe(300)
    })

    it('should discard a previous start with the same name', () => {
      const { rawRumEvents, clock } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.custom.foo).toBe(100)
    })
  })

  it('should collect raw rum event from duration vital', () => {
    const { rawRumEvents } = setupBuilder.build()

    vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
    vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

    expect(rawRumEvents[0].startTime).toEqual(jasmine.any(Number))
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      vital: {
        id: jasmine.any(String),
        type: VitalType.DURATION,
        custom: {
          foo: 0,
        },
      },
      type: RumEventType.VITAL,
    })
    expect(rawRumEvents[0].domainContext).toEqual({})
  })
})
