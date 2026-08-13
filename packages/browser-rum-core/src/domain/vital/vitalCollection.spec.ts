import type { Duration } from '@datadog/js-core/time'
import { mockClock, type Clock } from '@datadog/browser-core/test'
import { clocksNow } from '@datadog/js-core/time'
import { generateUUID } from '@datadog/browser-core'
import { collectAndValidateRawRumEvents, mockPageStateHistory } from '../../../test'
import type { RawRumEvent, RawRumVitalEvent, RawRumWebSocketVitalEvent } from '../../rawRumEvent.types'
import { VitalType, RumEventType, WebSocketVitalName } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startVitalCollection } from './vitalCollection'

const pageStateHistory = mockPageStateHistory()

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

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  describe('custom duration', () => {
    it('should create a vital from start API using name', () => {
      vitalCollection.startDurationVital('foo', {
        context: { foo: 'bar' },
        description: 'baz',
      })

      clock.tick(100)

      vitalCollection.stopDurationVital('foo')

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          vital: jasmine.objectContaining({ duration: 100000000, description: 'baz' }),
          context: { foo: 'bar' },
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

  describe('operation step vital', () => {
    it('should collect raw rum event from operation step vital', () => {
      vitalCollection.addOperationStepVital('foo', 'start')

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

      expect(rawRumEvents[0].domainContext).toEqual({
        handlingStack: 'Error\n    at foo\n    at bar',
      })
    })

    it('should create a operation step vital from add API', () => {
      vitalCollection.addOperationStepVital(
        'foo',
        'end',
        {
          operationKey: '00000000-0000-0000-0000-000000000000',
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
          }),
          context: { foo: 'bar' },
        })
      )
    })
  })

  describe('websocket vital', () => {
    /** A WebSocket vital as its serializer produces it: whole, instant, and schema-valid. */
    function webSocketVital(id = generateUUID()): RawRumWebSocketVitalEvent {
      return {
        date: clocksNow().timeStamp,
        type: RumEventType.VITAL,
        vital: {
          id,
          type: VitalType.WEBSOCKET,
          name: WebSocketVitalName.CONNECTING,
          websocket: {
            id: generateUUID(),
            url: 'wss://example.com/socket',
            connecting_date: clocksNow().timeStamp,
          },
        },
      }
    }

    it('should collect raw rum event from websocket vital', () => {
      const vital = webSocketVital()
      const startClocks = clocksNow()
      // the vital is dated when it was taken, not when it is handed over
      clock.tick(100)

      vitalCollection.addWebSocketVital(vital, startClocks)

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].startClocks).toEqual(startClocks)
      expect(rawRumEvents[0].rawRumEvent).toBe(vital)
      expect(rawRumEvents[0].domainContext).toEqual({})
    })

    it('should collect a websocket vital emitted on a page that was frozen', () => {
      wasInPageStateDuringPeriodSpy.and.returnValue(true)

      vitalCollection.addWebSocketVital(webSocketVital(), clocksNow())

      expect(rawRumEvents.length).toBe(1)
    })

    it('should not involve the event tracker', () => {
      const vitalId = generateUUID()
      const durationVitalStartedSpy = jasmine.createSpy()
      lifeCycle.subscribe(LifeCycleEventType.DURATION_VITAL_STARTED, durationVitalStartedSpy)

      vitalCollection.addWebSocketVital(webSocketVital(vitalId), clocksNow())

      expect(durationVitalStartedSpy).not.toHaveBeenCalled()
      // no start/stop bookkeeping means the vital rides through untouched, keeping its own id and
      // reporting no duration
      expect((rawRumEvents[0].rawRumEvent as RawRumWebSocketVitalEvent).vital.id).toBe(vitalId)
      expect(rawRumEvents[0].duration).toBeUndefined()
    })
  })
})
