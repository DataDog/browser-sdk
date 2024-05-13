import { clocksNow } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import { startVitalCollection } from './vitalCollection'

describe('vitalCollection', () => {
  let setupBuilder: TestSetupBuilder
  let vitalCollection: ReturnType<typeof startVitalCollection>
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, pageStateHistory }) => {
        wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
        vitalCollection = startVitalCollection(lifeCycle, pageStateHistory)
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

    it('should not create multiple duration vitals by calling the stop API multiple times', () => {
      const { rawRumEvents } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(1)
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

    it('should merge start and stop contexts', () => {
      const { rawRumEvents } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'both-undefined', startClocks: clocksNow() })
      vitalCollection.stopDurationVital({ name: 'both-undefined', stopClocks: clocksNow() })
      vitalCollection.startDurationVital({
        name: 'start-defined',
        startClocks: clocksNow(),
        context: { start: 'defined' },
      })
      vitalCollection.stopDurationVital({ name: 'start-defined', stopClocks: clocksNow() })
      vitalCollection.startDurationVital({ name: 'stop-defined', startClocks: clocksNow() })
      vitalCollection.stopDurationVital({ name: 'stop-defined', stopClocks: clocksNow(), context: { stop: 'defined' } })
      vitalCollection.startDurationVital({
        name: 'both-defined',
        startClocks: clocksNow(),
        context: { start: 'defined' },
      })
      vitalCollection.stopDurationVital({ name: 'both-defined', stopClocks: clocksNow(), context: { stop: 'defined' } })
      vitalCollection.startDurationVital({
        name: 'stop-precedence',
        startClocks: clocksNow(),
        context: { precedence: 'start' },
      })
      vitalCollection.stopDurationVital({
        name: 'stop-precedence',
        stopClocks: clocksNow(),
        context: { precedence: 'stop' },
      })

      expect(rawRumEvents[0].customerContext).toEqual(undefined)
      expect(rawRumEvents[1].customerContext).toEqual({ start: 'defined' })
      expect(rawRumEvents[2].customerContext).toEqual({ stop: 'defined' })
      expect(rawRumEvents[3].customerContext).toEqual({ start: 'defined', stop: 'defined' })
      expect(rawRumEvents[4].customerContext).toEqual({ precedence: 'stop' })
    })

    it('should discard a vital for which a frozen state happened', () => {
      const { rawRumEvents, clock } = setupBuilder.build()
      wasInPageStateDuringPeriodSpy.and.returnValue(true)

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(0)
    })

    it('should discard pending vitals on SESSION_RENEWED', () => {
      const { rawRumEvents, lifeCycle, clock } = setupBuilder.build()

      vitalCollection.startDurationVital({ name: 'foo', startClocks: clocksNow() })
      clock.tick(100)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      vitalCollection.stopDurationVital({ name: 'foo', stopClocks: clocksNow() })

      expect(rawRumEvents.length).toBe(0)
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
        name: 'foo',
        custom: {
          foo: 0,
        },
      },
      type: RumEventType.VITAL,
      _dd: {
        vital: {
          computed_value: true,
        },
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({})
  })
})
