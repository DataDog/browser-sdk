import { beforeEach, describe, expect, it } from 'vitest'
import type { FlushEvent, Context, Telemetry } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import type { Clock, MockTelemetry } from '@datadog/browser-core/test'
import { mockClock, startMockTelemetry } from '@datadog/browser-core/test'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { MEASURES_PERIOD_DURATION, startCustomerDataTelemetry } from './startCustomerDataTelemetry'

describe('customerDataTelemetry', () => {
  let clock: Clock
  let batchFlushObservable: Observable<FlushEvent>
  let telemetry: MockTelemetry
  let fakeContextBytesCount: number
  let lifeCycle: LifeCycle
  const viewEvent = { type: RumEventType.VIEW } as AssembledRumEvent

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

  function setupCustomerTelemetryCollection(metricsEnabled: boolean = true) {
    batchFlushObservable = new Observable()
    lifeCycle = new LifeCycle()
    fakeContextBytesCount = 1

    telemetry = startMockTelemetry()

    startCustomerDataTelemetry({ metricsEnabled } as Telemetry, lifeCycle, batchFlushObservable)
  }

  beforeEach(() => {
    clock = mockClock()
  })

  it('should collect customer data telemetry', async () => {
    setupCustomerTelemetryCollection()

    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(await telemetry.getEvents()).toEqual([
      expect.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Customer data measures',
        batchCount: 2,
        batchBytesCount: { min: 1, max: 10, sum: 11 },
        batchMessagesCount: { min: 1, max: 10, sum: 11 },
      }),
    ])
  })

  it('should collect customer data only if batches contains rum events, no just telemetry', async () => {
    setupCustomerTelemetryCollection()

    // Generate an initial batch with no RUM events. We should not generate any customer
    // data telemetry.
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(await telemetry.hasEvents()).toBe(false)

    // Generate a batch with RUM events. We should generate customer data telemetry for
    // this batch.
    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(await telemetry.getEvents()).toEqual([
      expect.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Customer data measures',
        batchCount: 1,
        batchBytesCount: { min: 10, max: 10, sum: 10 },
        batchMessagesCount: { min: 10, max: 10, sum: 10 },
      }),
    ])
    telemetry.reset()

    // Generate another batch with no RUM events. We should not generate any customer data
    // telemetry.
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should not collect contexts telemetry of a unfinished batches', async () => {
    setupCustomerTelemetryCollection()

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(await telemetry.getEvents()).toEqual([
      expect.objectContaining({
        batchMessagesCount: expect.objectContaining({ sum: 1 }),
      }),
    ])
  })

  it('should not collect customer data telemetry when telemetry disabled', async () => {
    setupCustomerTelemetryCollection(false)

    generateBatch({ eventNumber: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(await telemetry.hasEvents()).toBe(false)
  })
})
