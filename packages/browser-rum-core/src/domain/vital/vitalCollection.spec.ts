import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { Duration } from '@datadog/browser-core'
import { mockClock, type Clock } from '@datadog/browser-core/test'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import { collectAndValidateRawRumEvents, mockPageStateHistory } from '../../../test'
import type { RawRumEvent, RawRumVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startVitalCollection } from './vitalCollection'

const pageStateHistory = mockPageStateHistory()

describe('vitalCollection', () => {
  const lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let clock: Clock
  let vitalCollection: ReturnType<typeof startVitalCollection>
  let wasInPageStateDuringPeriodSpy: Mock<(...args: any[]) => any>

  beforeEach(() => {
    clock = mockClock()
<<<<<<< HEAD
    wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
    vitalCollection = startVitalCollection(lifeCycle, pageStateHistory)
=======
    wasInPageStateDuringPeriodSpy = vi.spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
    vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, vitalsState)
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  describe('custom duration', () => {
<<<<<<< HEAD
    it('should create a vital from start API using name', () => {
      vitalCollection.startDurationVital('foo', {
        context: { foo: 'bar' },
        description: 'baz',
      })

      clock.tick(100)
=======
    describe('startDurationVital', () => {
      it('should create duration vital from a vital reference', () => {
        const cbSpy = vi.fn()

        const vitalRef = startDurationVital(vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef)

        expect(cbSpy).toHaveBeenCalledTimes(1)
        expect(cbSpy).toHaveBeenCalledWith(
          expect.objectContaining({ id: expect.any(String), name: 'foo', duration: 100 })
        )
      })

      it('should create duration vital from a vital name', () => {
        const cbSpy = vi.fn()
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)

      vitalCollection.stopDurationVital('foo')

<<<<<<< HEAD
      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ duration: 100000000, description: 'baz' }),
          context: { foo: 'bar' },
=======
        expect(cbSpy).toHaveBeenCalledTimes(1)
        expect(cbSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should only create a single duration vital from a vital name', () => {
        const cbSpy = vi.fn()

        startDurationVital(vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, 'foo')
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, 'foo')

        expect(cbSpy).toHaveBeenCalledTimes(1)
        expect(cbSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'foo', duration: 100 }))
      })

      it('should not create multiple duration vitals by calling "stopDurationVital" on the same vital ref multiple times', () => {
        const cbSpy = vi.fn()

        const vital = startDurationVital(vitalsState, 'foo')
        stopDurationVital(cbSpy, vitalsState, vital)
        stopDurationVital(cbSpy, vitalsState, vital)

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should not create multiple duration vitals by calling "stopDurationVital" on the same vital name multiple times', () => {
        const cbSpy = vi.fn()

        startDurationVital(vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')
        stopDurationVital(cbSpy, vitalsState, 'bar')

        expect(cbSpy).toHaveBeenCalledTimes(1)
      })

      it('should create multiple duration vitals from multiple vital refs', () => {
        const cbSpy = vi.fn()

        const vitalRef1 = startDurationVital(vitalsState, 'foo', { description: 'component 1' })
        clock.tick(100)
        const vitalRef2 = startDurationVital(vitalsState, 'foo', { description: 'component 2' })
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef2)
        clock.tick(100)
        stopDurationVital(cbSpy, vitalsState, vitalRef1)

        expect(cbSpy).toHaveBeenCalledTimes(2)
        expect(cbSpy.mock.calls[0]).toEqual([expect.objectContaining({ description: 'component 2', duration: 100 })])
        expect(cbSpy.mock.calls[1]).toEqual([expect.objectContaining({ description: 'component 1', duration: 300 })])
      })

      it('should merge startDurationVital and stopDurationVital description', () => {
        const cbSpy = vi.fn()

        startDurationVital(vitalsState, 'both-undefined')
        stopDurationVital(cbSpy, vitalsState, 'both-undefined')

        startDurationVital(vitalsState, 'start-defined', { description: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'start-defined')

        startDurationVital(vitalsState, 'stop-defined')
        stopDurationVital(cbSpy, vitalsState, 'stop-defined', { description: 'stop-defined' })

        startDurationVital(vitalsState, 'both-defined', { description: 'start-defined' })
        stopDurationVital(cbSpy, vitalsState, 'both-defined', { description: 'stop-defined' })

        expect(cbSpy).toHaveBeenCalledTimes(4)
        expect(cbSpy.mock.calls[0]).toEqual([expect.objectContaining({ description: undefined })])
        expect(cbSpy.mock.calls[1]).toEqual([expect.objectContaining({ description: 'start-defined' })])
        expect(cbSpy.mock.calls[2]).toEqual([expect.objectContaining({ description: 'stop-defined' })])
        expect(cbSpy.mock.calls[3]).toEqual([expect.objectContaining({ description: 'stop-defined' })])
      })

      it('should merge startDurationVital and stopDurationVital contexts', () => {
        const cbSpy = vi.fn()

        const vitalRef1 = startDurationVital(vitalsState, 'both-undefined')
        stopDurationVital(cbSpy, vitalsState, vitalRef1)

        const vitalRef2 = startDurationVital(vitalsState, 'start-defined', {
          context: { start: 'defined' },
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
        })
      )
    })

    it('should create a vital from start API using vitalKey', () => {
      vitalCollection.startDurationVital('foo', {
        vitalKey: 'my-key',
        context: { foo: 'bar' },
        description: 'baz',
      })

      clock.tick(100)

      vitalCollection.stopDurationVital('foo', { vitalKey: 'my-key' })

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ duration: 100000000, description: 'baz' }),
          context: { foo: 'bar' },
        })
      )
    })

    it('should only create a single vital when stopping by name multiple times', () => {
      vitalCollection.startDurationVital('foo')
      clock.tick(100)
      vitalCollection.stopDurationVital('foo')
      clock.tick(100)
      vitalCollection.stopDurationVital('foo')

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({ vital: jasmine.objectContaining({ duration: 100000000 }) })
      )
    })

    it('should create multiple duration vitals from multiple vital keys', () => {
      vitalCollection.startDurationVital('foo', { vitalKey: 'key-1', description: 'component 1' })
      clock.tick(100)
      vitalCollection.startDurationVital('foo', { vitalKey: 'key-2', description: 'component 2' })
      clock.tick(100)
      vitalCollection.stopDurationVital('foo', { vitalKey: 'key-2' })
      clock.tick(100)
      vitalCollection.stopDurationVital('foo', { vitalKey: 'key-1' })

      expect(rawRumEvents.length).toBe(2)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ description: 'component 2', duration: 100000000 }),
        })
      )
      expect(rawRumEvents[1].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ description: 'component 1', duration: 300000000 }),
        })
      )
    })

<<<<<<< HEAD
    it('should merge startDurationVital and stopDurationVital description', () => {
      vitalCollection.startDurationVital('both-undefined')
      vitalCollection.stopDurationVital('both-undefined')

      vitalCollection.startDurationVital('start-defined', { description: 'start-defined' })
      vitalCollection.stopDurationVital('start-defined')

      vitalCollection.startDurationVital('stop-defined')
      vitalCollection.stopDurationVital('stop-defined', { description: 'stop-defined' })

      vitalCollection.startDurationVital('both-defined', { description: 'start-defined' })
      vitalCollection.stopDurationVital('both-defined', { description: 'stop-defined' })

      expect(rawRumEvents.length).toBe(4)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBeUndefined()
      expect((rawRumEvents[1].rawRumEvent as RawRumVitalEvent).vital.description).toBe('start-defined')
      expect((rawRumEvents[2].rawRumEvent as RawRumVitalEvent).vital.description).toBe('stop-defined')
      expect((rawRumEvents[3].rawRumEvent as RawRumVitalEvent).vital.description).toBe('stop-defined')
    })

    it('should merge startDurationVital and stopDurationVital contexts', () => {
      vitalCollection.startDurationVital('both-undefined')
      vitalCollection.stopDurationVital('both-undefined')

      vitalCollection.startDurationVital('start-defined', { context: { start: 'defined' } })
      vitalCollection.stopDurationVital('start-defined')

      vitalCollection.startDurationVital('stop-defined')
      vitalCollection.stopDurationVital('stop-defined', { context: { stop: 'defined' } })

      vitalCollection.startDurationVital('both-defined', { context: { start: 'defined' } })
      vitalCollection.stopDurationVital('both-defined', { context: { stop: 'defined' } })

      vitalCollection.startDurationVital('stop-precedence', { context: { precedence: 'start' } })
      vitalCollection.stopDurationVital('stop-precedence', { context: { precedence: 'stop' } })

      expect(rawRumEvents.length).toBe(5)
      expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).context).toBeUndefined()
      expect((rawRumEvents[1].rawRumEvent as RawRumVitalEvent).context).toEqual({ start: 'defined' })
      expect((rawRumEvents[2].rawRumEvent as RawRumVitalEvent).context).toEqual({ stop: 'defined' })
      expect((rawRumEvents[3].rawRumEvent as RawRumVitalEvent).context).toEqual({ start: 'defined', stop: 'defined' })
      expect((rawRumEvents[4].rawRumEvent as RawRumVitalEvent).context).toEqual({ precedence: 'stop' })
    })

    it('should discard a vital for which a frozen state happened', () => {
      wasInPageStateDuringPeriodSpy.and.returnValue(true)

      vitalCollection.addDurationVital({
        id: generateUUID(),
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

      expect(rawRumEvents[0].startClocks.relative).toEqual(jasmine.any(Number))
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        vital: {
          id: jasmine.any(String),
          type: VitalType.DURATION,
          name: 'foo',
          duration: 0,
          description: undefined,
        },
        context: undefined,
        type: RumEventType.VITAL,
      })
      expect(rawRumEvents[0].domainContext).toEqual({})
    })

    it('should create vital with handling stack', () => {
      vitalCollection.startDurationVital('foo', {
        handlingStack: 'Error\n    at foo\n    at bar',
      })
      vitalCollection.stopDurationVital('foo')

      expect(rawRumEvents[0].domainContext).toEqual({
        handlingStack: 'Error\n    at foo\n    at bar',
=======
        expect(cbSpy).toHaveBeenCalledTimes(5)
        expect(cbSpy.mock.calls[0][0].context).toEqual(undefined)
        expect(cbSpy.mock.calls[1][0].context).toEqual({ start: 'defined' })
        expect(cbSpy.mock.calls[2][0].context).toEqual({ stop: 'defined' })
        expect(cbSpy.mock.calls[3][0].context).toEqual({ start: 'defined', stop: 'defined' })
        expect(cbSpy.mock.calls[4][0].context).toEqual({ precedence: 'stop' })
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
      })
    })

    it('should create a duration vital from add API', () => {
      vitalCollection.addDurationVital({
        id: generateUUID(),
        name: 'foo',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
        context: { foo: 'bar' },
        description: 'baz',
      })

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ duration: 100000000, description: 'baz' }),
          context: { foo: 'bar' },
        })
      )
    })

    it('should notify lifecycle with vital started event when starting a duration vital', () => {
      const subscriberSpy = jasmine.createSpy()
      lifeCycle.subscribe(LifeCycleEventType.DURATION_VITAL_STARTED, subscriberSpy)

      vitalCollection.startDurationVital('foo')

      expect(subscriberSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'foo' }))
    })
  })

<<<<<<< HEAD
  describe('operation step vital', () => {
    it('should collect raw rum event from operation step vital', () => {
      vitalCollection.addOperationStepVital('foo', 'start')
=======
      it('should discard a vital for which a frozen state happened', () => {
        wasInPageStateDuringPeriodSpy.mockReturnValue(true)
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)

      expect(rawRumEvents[0].startClocks.relative).toEqual(jasmine.any(Number))
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        vital: {
          id: jasmine.any(String),
          type: VitalType.OPERATION_STEP,
          name: 'foo',
          step_type: 'start',
          operation_key: undefined,
          failure_reason: undefined,
          description: undefined,
        },
        context: undefined,
        type: RumEventType.VITAL,
      })
      expect(rawRumEvents[0].domainContext).toEqual({})
    })

    it('should create operation step vital with handling stack in domainContext', () => {
      vitalCollection.addOperationStepVital('foo', 'start', {
        handlingStack: 'Error\n    at foo\n    at bar',
      })

<<<<<<< HEAD
      expect(rawRumEvents[0].domainContext).toEqual({
        handlingStack: 'Error\n    at foo\n    at bar',
=======
      it('should collect raw rum event from duration vital', () => {
        vitalCollection.startDurationVital('foo')
        vitalCollection.stopDurationVital('foo')

        expect(rawRumEvents[0].startClocks.relative).toEqual(expect.any(Number))
        expect(rawRumEvents[0].rawRumEvent).toEqual({
          date: expect.any(Number),
          vital: {
            id: expect.any(String),
            type: VitalType.DURATION,
            name: 'foo',
            duration: 0,
            description: undefined,
          },
          context: undefined,
          type: RumEventType.VITAL,
        })
        expect(rawRumEvents[0].domainContext).toEqual({})
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
      })
    })

<<<<<<< HEAD
    it('should create a operation step vital from add API', () => {
      vitalCollection.addOperationStepVital(
        'foo',
        'end',
        {
          operationKey: '00000000-0000-0000-0000-000000000000',
=======
      it('should create vital with handling stack', () => {
        vitalCollection.startDurationVital('foo', {
          handlingStack: 'Error\n    at foo\n    at bar',
        })
        vitalCollection.stopDurationVital('foo')

        expect(rawRumEvents[0].domainContext).toEqual({
          handlingStack: 'Error\n    at foo\n    at bar',
        })
      })

      it('should collect raw rum event from operation step vital', () => {
        addExperimentalFeatures([ExperimentalFeature.FEATURE_OPERATION_VITAL])
        vitalCollection.addOperationStepVital('foo', 'start')

        expect(rawRumEvents[0].startClocks.relative).toEqual(expect.any(Number))
        expect(rawRumEvents[0].rawRumEvent).toEqual({
          date: expect.any(Number),
          vital: {
            id: expect.any(String),
            type: VitalType.OPERATION_STEP,
            name: 'foo',
            step_type: 'start',
            operation_key: undefined,
            failure_reason: undefined,
            description: undefined,
          },
          context: undefined,
          type: RumEventType.VITAL,
        })
        expect(rawRumEvents[0].domainContext).toEqual({})
      })

      it('should create operation step vital with handling stack in domainContext', () => {
        addExperimentalFeatures([ExperimentalFeature.FEATURE_OPERATION_VITAL])
        vitalCollection.addOperationStepVital('foo', 'start', {
          handlingStack: 'Error\n    at foo\n    at bar',
        })

        expect(rawRumEvents[0].domainContext).toEqual({
          handlingStack: 'Error\n    at foo\n    at bar',
        })
      })

      it('should create a duration vital from add API', () => {
        vitalCollection.addDurationVital({
          id: generateUUID(),
          name: 'foo',
          type: VitalType.DURATION,
          startClocks: clocksNow(),
          duration: 100 as Duration,
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
          context: { foo: 'bar' },
          description: 'baz',
        },
        'error'
      )

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({
            step_type: 'end',
            operation_key: '00000000-0000-0000-0000-000000000000',
            failure_reason: 'error',
            description: 'baz',
<<<<<<< HEAD
          }),
          context: { foo: 'bar' },
        })
      )
=======
          },
          'error'
        )

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.step_type).toBe('end')
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.operation_key).toBe(
          '00000000-0000-0000-0000-000000000000'
        )
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.failure_reason).toBe('error')
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).vital.description).toBe('baz')
        expect((rawRumEvents[0].rawRumEvent as RawRumVitalEvent).context).toEqual({ foo: 'bar' })
      })

      it('should notify lifecycle with vital started event when starting a duration vital', () => {
        const subscriberSpy = vi.fn()
        lifeCycle.subscribe(LifeCycleEventType.VITAL_STARTED, subscriberSpy)

        vitalCollection.startDurationVital('foo')

        expect(subscriberSpy).toHaveBeenCalledTimes(1)
        expect(subscriberSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'foo' }))
      })
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
    })
  })
})
