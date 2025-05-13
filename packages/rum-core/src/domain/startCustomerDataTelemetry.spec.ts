import type { FlushEvent, Context, TelemetryEvent, CustomerDataTracker } from '@flashcatcloud/browser-core'
import {
  Observable,
  startTelemetry,
  TelemetryService,
  resetExperimentalFeatures,
  createCustomerDataTrackerManager,
} from '@flashcatcloud/browser-core'
import type { Clock } from '@flashcatcloud/browser-core/test'
import { mockClock } from '@flashcatcloud/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { MEASURES_PERIOD_DURATION, startCustomerDataTelemetry } from './startCustomerDataTelemetry'
import type { RumConfiguration } from './configuration'

describe('customerDataTelemetry', () => {
  let clock: Clock
  let batchFlushObservable: Observable<FlushEvent>
  let telemetryEvents: TelemetryEvent[]
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

  function setupCustomerTlemertyCollection(partialConfig: Partial<RumConfiguration> = config) {
    const configuration = mockRumConfiguration(partialConfig)
    batchFlushObservable = new Observable()
    lifeCycle = new LifeCycle()
    fakeContextBytesCount = 1
    const customerDataTrackerManager = createCustomerDataTrackerManager()
    spyOn(customerDataTrackerManager, 'getOrCreateTracker').and.callFake(
      () =>
        ({
          getBytesCount: () => fakeContextBytesCount,
        }) as CustomerDataTracker
    )

    telemetryEvents = []
    const telemetry = startTelemetry(TelemetryService.RUM, configuration)
    telemetry.observable.subscribe((telemetryEvent) => telemetryEvents.push(telemetryEvent))

    startCustomerDataTelemetry(configuration, telemetry, lifeCycle, customerDataTrackerManager, batchFlushObservable)
  }

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    resetExperimentalFeatures()
    clock.cleanup()
  })

  it('should collect customer data telemetry', () => {
    setupCustomerTlemertyCollection()

    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry).toEqual(
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Customer data measures',
        batchCount: 2,
        batchBytesCount: { min: 1, max: 10, sum: 11 },
        batchMessagesCount: { min: 1, max: 10, sum: 11 },
        globalContextBytes: { min: 1, max: 10, sum: 101 },
        userContextBytes: { min: 1, max: 10, sum: 101 },
        featureFlagBytes: { min: 1, max: 10, sum: 101 },
      })
    )
  })

  it('should collect empty contexts telemetry', () => {
    setupCustomerTlemertyCollection()

    generateBatch({ eventNumber: 1, contextBytesCount: 0, context: {} })

    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry).toEqual(
      jasmine.objectContaining({
        globalContextBytes: { min: 0, max: 0, sum: 0 },
        userContextBytes: { min: 0, max: 0, sum: 0 },
        featureFlagBytes: { min: 0, max: 0, sum: 0 },
      })
    )
  })

  it('should collect customer data only if batches contains rum events, no just telemetry', () => {
    setupCustomerTlemertyCollection()

    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })

    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })

  it('should not collect contexts telemetry of a unfinished batches', () => {
    setupCustomerTlemertyCollection()

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry.batchMessagesCount).toEqual(jasmine.objectContaining({ sum: 1 }))
    expect(telemetryEvents[0].telemetry.globalContextBytes).toEqual(jasmine.objectContaining({ sum: 1 }))
    expect(telemetryEvents[0].telemetry.userContextBytes).toEqual(jasmine.objectContaining({ sum: 1 }))
    expect(telemetryEvents[0].telemetry.featureFlagBytes).toEqual(jasmine.objectContaining({ sum: 1 }))
  })

  it('should not collect customer data telemetry when telemetry disabled', () => {
    setupCustomerTlemertyCollection({
      telemetrySampleRate: 100,
      customerDataTelemetrySampleRate: 0,
    })

    generateBatch({ eventNumber: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })
})
