import type { Duration } from '@datadog/browser-core'
import { mockClock, registerCleanupTask, type Clock } from '@datadog/browser-core/test'
import { clocksNow, noop } from '@datadog/browser-core'
import { collectAndValidateRawRumEvents, mockPageStateHistory } from '../../../test'
import type { RawRumEvent, RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import type { FeatureFlagContexts } from '../contexts/featureFlagContext'
import type { FeatureFlagEvent } from '../configuration'
import { LifeCycle } from '../lifeCycle'
import { startDurationVital, stopDurationVital, startVitalCollection, createCustomVitalsState } from './vitalCollection'

const pageStateHistory = mockPageStateHistory()

const vitalsState = createCustomVitalsState()

const baseFeatureFlagContexts: FeatureFlagContexts = {
  findFeatureFlagEvaluations: () => undefined,
  addFeatureFlagEvaluation: noop,
  stop: noop,
}

describe('vitalCollection', () => {
  const lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let clock: Clock
  let vitalCollection: ReturnType<typeof startVitalCollection>
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>
  const featureFlagContexts: FeatureFlagContexts = baseFeatureFlagContexts
  let collectFeatureFlagsOn = new Set<FeatureFlagEvent>()

  beforeEach(() => {
    clock = mockClock()
    wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
    vitalCollection = startVitalCollection(
      lifeCycle,
      pageStateHistory,
      vitalsState,
      featureFlagContexts,
      collectFeatureFlagsOn
    )

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
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

      it('should only create a single duration vital from a vital name', () => {
        const cbSpy = jasmine.createSpy()

        startDurationVital(vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, 'foo')

        expect(cbSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should not create multiple duration vitals by calling "stopDurationVital" on the same vital ref multiple times', () => {
        const cbSpy = jasmine.createSpy()

        const vital = startDurationVital(vitalsState, 'foo')
        stopDurationVital(cbSpy, vitalsState, vital)
        stopDurationVital(cbSpy, vitalsState, vital)

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should not create multiple duration vitals by calling "stopDurationVital" on the same vital name multiple times', () => {
        const cbSpy = jasmine.createSpy()

        startDurationVital(vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should create multiple duration vitals from multiple vital refs', () => {
        const cbSpy = jasmine.createSpy()

        const vitalRef1 = startDurationVital(vitalsState, 'foo', { description: 'component 1' })
        clock.tick(100)
        const vitalRef2 = startDurationVital(vitalsState, 'foo', { description: 'component 2' })
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef2)
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef1)

        expect(cbSpy).toHaveBeenCalledTimes(2)
        expect(cbSpy.calls.argsFor(0)).toEqual([
          jasmine.objectContaining({ description: 'component 2', duration: 100 }),
        ])
        expect(cbSpy.calls.argsFor(1)).toEqual([
          jasmine.objectContaining({ description: 'component 1', duration: 300 }),
        ])
      })

      it('should merge startDurationVital and stopDurationVital description', () => {
        const cbSpy = jasmine.createSpy()

        startDurationVital(vitalsState, 'both-undefined')
        stopDurationVital(cbSpy, vitalsState, 'both-undefined')

        startDurationVital(vitalsState, 'start-defined', { description: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'start-defined')

        startDurationVital(vitalsState, 'stop-defined')
        stopDurationVital(cbSpy, vitalsState, 'stop-defined', { description: 'stop-defined' })

        startDurationVital(vitalsState, 'both-defined', { description: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'both-defined', { description: 'stop-defined' })

        expect(cbSpy).toHaveBeenCalledTimes(4)
        expect(cbSpy.calls.argsFor(0)).toEqual([jasmine.objectContaining({ description: undefined })])
        expect(cbSpy.calls.argsFor(1)).toEqual([jasmine.objectContaining({ description: 'start-defined' })])
        expect(cbSpy.calls.argsFor(2)).toEqual([jasmine.objectContaining({ description: 'stop-defined' })])
        expect(cbSpy.calls.argsFor(3)).toEqual([jasmine.objectContaining({ description: 'stop-defined' })])
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

    describe('startVitalCollection', () => {
      it('should create a vital from start API using name', () => {
        vitalCollection.startDurationVital('foo', {
          context: { foo: 'bar' },
          description: 'baz',
        })

        clock.tick(100)

        vitalCollection.stopDurationVital('foo')

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBe('baz')
        expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
      })

      it('should create a vital from start API using ref', () => {
        const vital = vitalCollection.startDurationVital('foo', {
          context: { foo: 'bar' },
          description: 'baz',
        })

        clock.tick(100)

        vitalCollection.stopDurationVital(vital)

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBe('baz')
        expect(rawRumEvents[0].customerContext).toEqual({ foo: 'bar' })
      })

      it('should create a vital from add API', () => {
        vitalCollection.addDurationVital({
          name: 'foo',
          type: VitalType.DURATION,
          startClocks: clocksNow(),
          duration: 100 as Duration,
          context: { foo: 'bar' },
          description: 'baz',
        })

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBe('baz')
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
            description: undefined,
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

      it('should create a vital from add API', () => {
        vitalCollection.addDurationVital({
          name: 'foo',
          type: VitalType.DURATION,
          startClocks: clocksNow(),
          duration: 100 as Duration,
          context: { foo: 'bar' },
          description: 'baz',
        })

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.duration).toBe(100000000)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBe('baz')
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
  })
  describe('feature flags integration', () => {
    it('should include feature flags when "vital" is in collectFeatureFlagsOn', () => {
      collectFeatureFlagsOn = new Set<FeatureFlagEvent>(['vital'])
      featureFlagContexts.findFeatureFlagEvaluations = jasmine.createSpy().and.returnValue({
        feature_flag_key: 'feature_flag_value',
      })

      vitalCollection = startVitalCollection(
        lifeCycle,
        pageStateHistory,
        vitalsState,
        featureFlagContexts,
        collectFeatureFlagsOn
      )

      vitalCollection.addDurationVital({
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
      })

      expect(rawRumEvents.length).toBe(1)
      const event = rawRumEvents[0].rawRumEvent as RawRumVitalEvent
      expect(event.feature_flags).toEqual({ feature_flag_key: 'feature_flag_value' })
    })

    it('should not include feature flags when "vital" is not in collectFeatureFlagsOn', () => {
      collectFeatureFlagsOn = new Set<FeatureFlagEvent>()
      featureFlagContexts.findFeatureFlagEvaluations = jasmine.createSpy().and.returnValue({
        feature_flag_key: 'feature_flag_value',
      })

      vitalCollection = startVitalCollection(
        lifeCycle,
        pageStateHistory,
        vitalsState,
        featureFlagContexts,
        collectFeatureFlagsOn
      )

      vitalCollection.addDurationVital({
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
      })

      expect(rawRumEvents.length).toBe(1)
      const event = rawRumEvents[0].rawRumEvent as RawRumVitalEvent
      expect(event.feature_flags).toBeUndefined()
    })

    it('should not include feature flags if none are available', () => {
      collectFeatureFlagsOn = new Set<FeatureFlagEvent>(['vital'])
      featureFlagContexts.findFeatureFlagEvaluations = jasmine.createSpy().and.returnValue(undefined)

      vitalCollection = startVitalCollection(
        lifeCycle,
        pageStateHistory,
        vitalsState,
        featureFlagContexts,
        collectFeatureFlagsOn
      )

      vitalCollection.addDurationVital({
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
      })

      expect(rawRumEvents.length).toBe(1)
      const event = rawRumEvents[0].rawRumEvent as RawRumVitalEvent
      expect(event.feature_flags).toBeUndefined()
    })
  })
})
