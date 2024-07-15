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
    })
  })

  describe('custom duration', () => {
    describe('createVitalInstance', () => {
      it('should create duration vital from a vital instance', () => {
        const cbSpy = jasmine.createSpy()

        const vital = createVitalInstance(cbSpy, { name: 'foo' })
        clock.tick(100)
        vital.stop({})

        expect(cbSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should not create duration vital without calling `stop` on vital instance', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'foo' })

        expect(cbSpy).not.toHaveBeenCalled()
      })

      it('should not create multiple duration vitals by calling "stop" on the same vital instance multiple times', () => {
        const cbSpy = jasmine.createSpy()

        const vital = createVitalInstance(cbSpy, { name: 'foo' })
        vital.stop()
        vital.stop()

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should create multiple duration vitals from createVitalInstance', () => {
        const cbSpy = jasmine.createSpy()

        const vital1 = createVitalInstance(cbSpy, { name: 'foo', details: 'component 1' })
        clock.tick(100)
        const vital2 = createVitalInstance(cbSpy, { name: 'foo', details: 'component 2' })
        clock.tick(100)
        vital2.stop()
        clock.tick(100)
        vital1.stop()

        expect(cbSpy).toHaveBeenCalledTimes(2)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: 'component 2', duration: 100 })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'component 1', duration: 300 })])
      })

      it('should merge createVitalInstance and vital instance details', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'both-undefined' }).stop()
        createVitalInstance(cbSpy, { name: 'start-defined', details: 'start-defined' }).stop()
        createVitalInstance(cbSpy, { name: 'stop-defined' }).stop({ details: 'stop-defined' })
        createVitalInstance(cbSpy, { name: 'both-defined', details: 'start-defined' }).stop({ details: 'stop-defined' })

        expect(cbSpy).toHaveBeenCalledTimes(4)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ details: undefined })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ details: 'start-defined' })])
        expect(cbSpy.calls.argsFor(2)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
        expect(cbSpy.calls.argsFor(3)).toEqual([jasmine.objectContaining({ details: 'stop-defined' })])
      })

      it('should merge createVitalInstance and vital instance contexts', () => {
        const cbSpy = jasmine.createSpy()

        createVitalInstance(cbSpy, { name: 'both-undefined' }).stop()
        createVitalInstance(cbSpy, { name: 'start-defined', context: { start: 'defined' } }).stop()
        createVitalInstance(cbSpy, { name: 'stop-defined' }).stop({ context: { stop: 'defined' } })
        createVitalInstance(cbSpy, { name: 'both-defined', context: { start: 'defined' } }).stop({
          context: { stop: 'defined' },
        })
        createVitalInstance(cbSpy, { name: 'stop-precedence', context: { precedence: 'start' } }).stop({
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
      const vital = vitalCollection.startDurationVital({
        name: 'foo',
        context: { foo: 'bar' },
        details: 'baz',
      })

      clock.tick(100)

      vital.stop()

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
    const vital = createVitalInstance(vitalCollection.addDurationVital, { name: 'foo' })
    vital.stop()

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
