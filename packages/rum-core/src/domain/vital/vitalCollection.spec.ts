import type { Duration } from '@datadog/browser-core'
import { clocksNow } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import { createVitalInstance, startVitalCollection } from './vitalCollection'

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
    describe('createVitalInstance', () => {
      it('should create duration vital from a vital instance', () => {
        const { rawRumEvents, clock } = setupBuilder.build()

        const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
        clock.tick(100)
        vital.stop({})

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100)
      })

      it('should not create duration vital without calling `stop` on vital instance', () => {
        const { rawRumEvents } = setupBuilder.build()

        createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })

        expect(rawRumEvents.length).toBe(0)
      })

      it('should not create multiple duration vitals by calling "stop" on a vital instance multiple times', () => {
        const { rawRumEvents } = setupBuilder.build()

        const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
        vital.stop()
        vital.stop()

        expect(rawRumEvents.length).toBe(1)
      })

      it('should create multiple duration vitals from createVitalInstance', () => {
        const { rawRumEvents, clock } = setupBuilder.build()

        const vital1 = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo', details: 'component 1' })
        clock.tick(100)
        const vital2 = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo', details: 'component 2' })
        clock.tick(100)
        vital2.stop()
        clock.tick(100)
        vital1.stop()

        expect(rawRumEvents.length).toBe(2)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.details).toBe('component 2')
        expect((rawRumEvents[1].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(300)
        expect((rawRumEvents[1].rawRumEvent as RawRumVitalEvent).vital.details).toBe('component 1')
      })
    })

    it('should create a vitals from add API', () => {
      const { rawRumEvents } = setupBuilder.build()

      vitalCollection.addDurationVital({
        name: 'foo',
        startClocks: clocksNow(),
        duration: 100 as Duration,
        context: { foo: 'bar' },
        details: 'baz',
      })

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.details).toBe('baz')
      expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
    })

    it('should merge start and stop contexts', () => {
      const { rawRumEvents } = setupBuilder.build()

      const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'both-undefined' })
      vital.stop()

      const vital1 = createVitalInstance(vitalCollection.addDurationVital, {
        name: 'start-defined',
        context: { start: 'defined' },
      })
      vital1.stop()

      const vital2 = createVitalInstance(vitalCollection.addDurationVital, { name: 'stop-defined' })
      vital2.stop({ context: { stop: 'defined' } })

      const vital3 = createVitalInstance(vitalCollection.addDurationVital, {
        name: 'both-defined',
        context: { start: 'defined' },
      })
      vital3.stop({ context: { stop: 'defined' } })

      const vital4 = createVitalInstance(vitalCollection.addDurationVital, {
        name: 'stop-precedence',
        context: { precedence: 'start' },
      })
      vital4.stop({ context: { precedence: 'stop' } })

      expect(rawRumEvents[0].customerContext).toEqual(undefined)
      expect(rawRumEvents[1].customerContext).toEqual({ start: 'defined' })
      expect(rawRumEvents[2].customerContext).toEqual({ stop: 'defined' })
      expect(rawRumEvents[3].customerContext).toEqual({ start: 'defined', stop: 'defined' })
      expect(rawRumEvents[4].customerContext).toEqual({ precedence: 'stop' })
    })

    it('should discard a vital for which a frozen state happened', () => {
      const { rawRumEvents, clock } = setupBuilder.build()
      wasInPageStateDuringPeriodSpy.and.returnValue(true)

      const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
      clock.tick(100)
      vital.stop()

      expect(rawRumEvents.length).toBe(0)
    })
  })

  it('should collect raw rum event from duration vital', () => {
    const { rawRumEvents } = setupBuilder.build()

    const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
    vital.stop()

    expect(rawRumEvents[0].startTime).toEqual(jasmine.any(Number))
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      vital: {
        id: jasmine.any(String),
        type: VitalType.DURATION,
        name: 'foo',
        custom: {},
        duration: 0,
        details: undefined,
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
