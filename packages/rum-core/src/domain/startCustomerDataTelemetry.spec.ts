import type { FlushEvent, Context, Telemetry, RawTelemetryEvent } from '@datadog/browser-core'
import { Observable, resetExperimentalFeatures, startFakeTelemetry } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { MEASURES_PERIOD_DURATION, startCustomerDataTelemetry } from './startCustomerDataTelemetry'
import type { RumConfiguration } from './configuration'

describe('customerDataTelemetry', () => {
  let clock: Clock
  let batchFlushObservable: Observable<FlushEvent>
  let telemetryEvents: RawTelemetryEvent[]
  let fakeContextBytesCount: number
  let lifeCycle: LifeCycle
  const viewEvent = { type: RumEventType.VIEW } as RumEvent & Context

  const config: Partial<RumConfiguration> = {
    telemetrySampleRate: 100,
    customerDataTelemetrySampleRate: 100,
    maxTelemetryEventsPerPage: 2,
  }

  function generateBatch({
    eventNumber,
    batchBytesCount = 1,
    contextBytesCount = fakeContextBytesCount,
  }: {
    eventNumber: number
    eventType?: RumEventType | 'Telemetry'
    batchBytesCount?: number
    contextBytesCount?: number
    context?: Context
  }) {
    fakeContextBytesCount = contextBytesCount

    for (let index = 0; index < eventNumber; index++) {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    }
    batchFlushObservable.notify({
      reason: 'duration_limit',
      bytesCount: batchBytesCount,
      messagesCount: eventNumber,
    })
  }

  function setupCustomerTelemetryCollection(partialConfig: Partial<RumConfiguration> = config) {
    const configuration = mockRumConfiguration(partialConfig)
    batchFlushObservable = new Observable()
    lifeCycle = new LifeCycle()
    fakeContextBytesCount = 1

    telemetryEvents = startFakeTelemetry()

    startCustomerDataTelemetry(configuration, { enabled: true } as Telemetry, lifeCycle, batchFlushObservable)
  }

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('should collect customer data telemetry', () => {
    setupCustomerTelemetryCollection()

    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0]).toEqual(
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Customer data measures',
        batchCount: 2,
        batchBytesCount: { min: 1, max: 10, sum: 11 },
        batchMessagesCount: { min: 1, max: 10, sum: 11 },
      })
    )
  })

  it('should collect customer data only if batches contains rum events, no just telemetry', () => {
    setupCustomerTelemetryCollection()

    // Generate an initial batch with no RUM events. We should not generate any customer
    // data telemetry.
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(telemetryEvents.length).toEqual(0)

    // Generate a batch with RUM events. We should generate customer data telemetry for
    // this batch.
    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(telemetryEvents[0]).toEqual(
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Customer data measures',
        batchCount: 1,
        batchBytesCount: { min: 10, max: 10, sum: 10 },
        batchMessagesCount: { min: 10, max: 10, sum: 10 },
      })
    )
    telemetryEvents.length = 0

    // Generate another batch with no RUM events. We should not generate any customer data
    // telemetry.
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(telemetryEvents.length).toEqual(0)
  })

  it('should not collect contexts telemetry of a unfinished batches', () => {
    setupCustomerTelemetryCollection()

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].batchMessagesCount).toEqual(jasmine.objectContaining({ sum: 1 }))
  })

  it('should not collect customer data telemetry when telemetry disabled', () => {
    setupCustomerTelemetryCollection({
      telemetrySampleRate: 100,
      customerDataTelemetrySampleRate: 0,
    })

    generateBatch({ eventNumber: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })
})
