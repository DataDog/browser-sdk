import type { Duration } from '@datadog/browser-core'
import { mockClock, registerCleanupTask, type Clock } from '@datadog/browser-core/test'
import { clocksNow } from '@datadog/browser-core'
import { validateRumEventFormat } from '../../../test'
import type { RawRumEvent, RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { createVitalInstance, startVitalCollection } from './vitalCollection'

const pageStateHistory: PageStateHistory = {
  findAll: () => undefined,
  addPageState: () => {},
  stop: () => {},
  wasInPageStateAt: () => false,
  wasInPageStateDuringPeriod: () => false,
}

describe('vitalCollection', () => {
  const lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let clock: Clock
  let vitalCollection: ReturnType<typeof startVitalCollection>
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    clock = mockClock()
    wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
    vitalCollection = startVitalCollection(lifeCycle, pageStateHistory)
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
    describe('createVitalInstance', () => {
      it('should create duration vital from a vital instance', () => {
        const cbSpy = jasmine.createSpy()

        const stopVital = createVitalInstance(cbSpy, { name: 'foo' })
        clock.tick(100)
        stopVital({})

        expect(cbSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should not create duration vital without calling `stop` on vital instance', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'foo' })

        expect(cbSpy).not.toHaveBeenCalled()
      })

      it('should not create multiple duration vitals by calling "stop" on the same vital instance multiple times', () => {
        const cbSpy = jasmine.createSpy()

        const stopVital = createVitalInstance(cbSpy, { name: 'foo' })
        stopVital()
        stopVital()

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should create multiple duration vitals from createVitalInstance', () => {
        const cbSpy = jasmine.createSpy()

        const stopVital1 = createVitalInstance(cbSpy, { name: 'foo', details: 'component 1' })
        clock.tick(100)
        const stopVital2 = createVitalInstance(cbSpy, { name: 'foo', details: 'component 2' })
        clock.tick(100)
        stopVital2()
        clock.tick(100)
        stopVital1()

        expect(cbSpy).toHaveBeenCalledTimes(2)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: 'component 2', duration: 100 })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'component 1', duration: 300 })])
      })

      it('should merge createVitalInstance and vital instance details', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'both-undefined' })()
        createVitalInstance(cbSpy, { name: 'start-defined', details: 'start-defined' })()
        createVitalInstance(cbSpy, { name: 'stop-defined' })({ details: 'stop-defined' })
        createVitalInstance(cbSpy, { name: 'both-defined', details: 'start-defined' })({ details: 'stop-defined' })

        expect(cbSpy).toHaveBeenCalledTimes(4)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: undefined })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'start-defined' })])
        expect(cbSpy.calls.argsFor(2)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
        expect(cbSpy.calls.argsFor(3)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
      })

      it('should merge createVitalInstance and vital instance contexts', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'both-undefined' })()
        createVitalInstance(cbSpy, { name: 'start-defined', context: { start: 'defined' } })()
        createVitalInstance(cbSpy, { name: 'stop-defined' })({ context: { stop: 'defined' } })
        createVitalInstance(cbSpy, { name: 'both-defined', context: { start: 'defined' } })({
          context: { stop: 'defined' },
        })
        createVitalInstance(cbSpy, { name: 'stop-precedence', context: { precedence: 'start' } })({
          context: { precedence: 'stop' },
        })

        expect(cbSpy).toHaveBeenCalledTimes(5)
        expect(cbSpy.calls.argsFor(0)[0].context).toEqual(undefined)
        expect(cbSpy.calls.argsFor(1)[0].context).toEqual({ start: 'defined' })
        expect(cbSpy.calls.argsFor(2)[0].context).toEqual({ stop: 'defined' })
        expect(cbSpy.calls.argsFor(3)[0].context).toEqual({ start: 'defined', stop: 'defined' })
        expect(cbSpy.calls.argsFor(4)[0].context).toEqual({ precedence: 'stop' })
      })
    })

    it('should create a vital from start API', () => {
      const stopVital = vitalCollection.startDurationVital({
        name: 'foo',
        context: { foo: 'bar' },
        details: 'baz',
      })

      clock.tick(100)

      stopVital()

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
    const stopVital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
    stopVital()

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
