import type { Duration } from '@datadog/browser-core'
import { mockClock, registerCleanupTask, type Clock } from '@datadog/browser-core/test'
import { clocksNow } from '@datadog/browser-core'
import { validateRumEventFormat } from '../../../test'
import type { RawRumEvent, RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { startDurationVital, stopDurationVital, startVitalCollection, createCustomVitalsState } from './vitalCollection'

const pageStateHistory: PageStateHistory = {
  findAll: () => undefined,
  addPageState: () => {},
  stop: () => {},
  wasInPageStateAt: () => false,
  wasInPageStateDuringPeriod: () => false,
}

const vitalsState = createCustomVitalsState()

describe('vitalCollection', () => {
  const lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let clock: Clock
  let vitalCollection: ReturnType<typeof startVitalCollection>
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    clock = mockClock()
    wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
    vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, vitalsState)
    const eventsSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
      rawRumEvents.push(data)
      validateRumEventFormat(data.rawRumEvent)
    })

    registerCleanupTask(() => {
      eventsSubscription.unsubscribe()
      rawRumEvents = []
      clock.cleanup()
    })
  })

  describe('custom duration', () => {
    describe('startDurationVital', () => {
      it('should create duration vital from a vital reference', () => {
        const cbSpy = jasmine.createSpy()

        const vitalRef = startDurationVital(vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef)

        expect(cbSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should create duration vital from a vital name', () => {
        const cbSpy = jasmine.createSpy()

        startDurationVital(vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, 'foo')

        expect(cbSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should not create multiple duration vitals by calling "stopDurationVital" on the same vital multiple times', () => {
        const cbSpy = jasmine.createSpy()

        const vital = startDurationVital(vitalsState, 'foo')
        stopDurationVital(cbSpy, vitalsState, vital)
        stopDurationVital(cbSpy, vitalsState, vital)

        expect(cbSpy).toHaveBeenCalledTimes(1)

        cbSpy.calls.reset()

        startDurationVital(vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should create multiple duration vitals from multiple vital refs', () => {
        const cbSpy = jasmine.createSpy()

        const vitalRef1 = startDurationVital(vitalsState, 'foo', { details: 'component 1' })
        clock.tick(100)
        const vitalRef2 = startDurationVital(vitalsState, 'foo', { details: 'component 2' })
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef2)
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef1)

        expect(cbSpy).toHaveBeenCalledTimes(2)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: 'component 2', duration: 100 })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'component 1', duration: 300 })])
      })

      it('should merge startDurationVital and stopDurationVital details', () => {
        const cbSpy = jasmine.createSpy()

        startDurationVital(vitalsState, 'both-undefined')
        stopDurationVital(cbSpy, vitalsState, 'both-undefined')

        startDurationVital(vitalsState, 'start-defined', { details: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'start-defined')

        startDurationVital(vitalsState, 'stop-defined')
        stopDurationVital(cbSpy, vitalsState, 'stop-defined', { details: 'stop-defined' })

        startDurationVital(vitalsState, 'both-defined', { details: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'both-defined', { details: 'stop-defined' })

        expect(cbSpy).toHaveBeenCalledTimes(4)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: undefined })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'start-defined' })])
        expect(cbSpy.calls.argsFor(2)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
        expect(cbSpy.calls.argsFor(3)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
      })

      it('should merge startDurationVital and stopDurationVital contexts', () => {
        const cbSpy = jasmine.createSpy()

        const vitalRef1 = startDurationVital(vitalsState, 'both-undefined')
        stopDurationVital(cbSpy, vitalsState, vitalRef1)

        const vitalRef2 = startDurationVital(vitalsState, 'start-defined', {
          context: { start: 'defined' },
        })
        stopDurationVital(cbSpy, vitalsState, vitalRef2)

        const vitalRef3 = startDurationVital(vitalsState, 'stop-defined', {
          context: { stop: 'defined' },
        })
        stopDurationVital(cbSpy, vitalsState, vitalRef3)

        const vitalRef4 = startDurationVital(vitalsState, 'both-defined', {
          context: { start: 'defined' },
        })
        stopDurationVital(cbSpy, vitalsState, vitalRef4, { context: { stop: 'defined' } })

        const vitalRef5 = startDurationVital(vitalsState, 'stop-precedence', {
          context: { precedence: 'start' },
        })
        stopDurationVital(cbSpy, vitalsState, vitalRef5, { context: { precedence: 'stop' } })

        expect(cbSpy).toHaveBeenCalledTimes(5)
        expect(cbSpy.calls.argsFor(0)[0].context).toEqual(undefined)
        expect(cbSpy.calls.argsFor(1)[0].context).toEqual({ start: 'defined' })
        expect(cbSpy.calls.argsFor(2)[0].context).toEqual({ stop: 'defined' })
        expect(cbSpy.calls.argsFor(3)[0].context).toEqual({ start: 'defined', stop: 'defined' })
        expect(cbSpy.calls.argsFor(4)[0].context).toEqual({ precedence: 'stop' })
      })
    })

    it('should create a vital from start API using name', () => {
      vitalCollection.startDurationVital('foo', {
        context: { foo: 'bar' },
        details: 'baz',
      })

      clock.tick(100)

      vitalCollection.stopDurationVital('foo')

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.details).toBe('baz')
      expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
    })

    it('should create a vital from start API using ref', () => {
      const vital = vitalCollection.startDurationVital('foo', {
        context: { foo: 'bar' },
        details: 'baz',
      })

      clock.tick(100)

      vitalCollection.stopDurationVital(vital)

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.details).toBe('baz')
      expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
    })

    it('should create a vital from add API', () => {
      vitalCollection.addDurationVital({
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
        context: { foo: 'bar' },
        details: 'baz',
      })

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.details).toBe('baz')
      expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
    })

    it('should discard a vital for which a frozen state happened', () => {
      wasInPageStateDuringPeriodSpy.and.returnValue(true)

      vitalCollection.addDurationVital({
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
      })

      expect(rawRumEvents.length).toBe(0)
    })
  })

  it('should collect raw rum event from duration vital', () => {
    vitalCollection.startDurationVital('foo')
    vitalCollection.stopDurationVital('foo')

    expect(rawRumEvents[0].startTime).toEqual(jasmine.any(Number))
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      vital: {
        id: jasmine.any(String),
        type: VitalType.DURATION,
        name: 'foo',
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
