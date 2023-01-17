import type { BatchFlushEvent, Context, TelemetryEvent } from '@datadog/browser-core'
import {
  resetExperimentalFeatures,
  updateExperimentalFeatures,
  TelemetryService,
  startTelemetry,
  Observable,
} from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../test/specHelper'
import { setup } from '../../test/specHelper'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { MEASURES_PERIOD_DURATION, startCustomerDataTelemetry } from './startCustomerDataTelemetry'

describe('customerDataTelemetry', () => {
  let setupBuilder: TestSetupBuilder
  let batchFlushObservable: Observable<BatchFlushEvent>
  let telemetryEvents: TelemetryEvent[]
  let fakeContextBytesCount: number
  let lifeCycle: LifeCycle

  function generateBatch({
    eventNumber,
    contextBytesCount,
    batchBytesCount,
  }: {
    eventNumber: number
    contextBytesCount: number
    batchBytesCount: number
  }) {
    fakeContextBytesCount = contextBytesCount
    for (let index = 0; index < eventNumber; index++) {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.VIEW } as RumEvent & Context)
    }
    batchFlushObservable.notify({ bufferBytesCount: batchBytesCount, bufferMessagesCount: eventNumber })
  }

  beforeEach(() => {
    updateExperimentalFeatures(['customer_data_telemetry'])
    setupBuilder = setup()
      .withFakeClock()
      .withConfiguration({
        telemetrySampleRate: 100,
        customerDataTelemetrySampleRate: 100,
        maxTelemetryEventsPerPage: 2,
      })
      .beforeBuild(({ globalContextManager, userContextManager, featureFlagContexts, configuration }) => {
        batchFlushObservable = new Observable()
        lifeCycle = new LifeCycle()
        fakeContextBytesCount = 1

        spyOn(globalContextManager, 'getBytesCount').and.callFake(() => fakeContextBytesCount)
        spyOn(userContextManager, 'getBytesCount').and.callFake(() => fakeContextBytesCount)
        spyOn(featureFlagContexts, 'getFeatureFlagBytesCount').and.callFake(() => fakeContextBytesCount)

        telemetryEvents = []
        const telemetry = startTelemetry(TelemetryService.RUM, configuration)
        telemetry.observable.subscribe((telemetryEvent) => telemetryEvents.push(telemetryEvent))

        startCustomerDataTelemetry(
          configuration,
          telemetry,
          lifeCycle,
          globalContextManager,
          userContextManager,
          featureFlagContexts,
          batchFlushObservable
        )
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    resetExperimentalFeatures()
  })

  it('should collect customer data telemetry', () => {
    const { clock } = setupBuilder.build()

    generateBatch({ eventNumber: 2, contextBytesCount: 2, batchBytesCount: 2 })
    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry).toEqual({
      type: 'log',
      status: 'debug',
      message: 'Customer data measures',
      batchCount: 2,
      batchBytesCount: { min: 1, max: 2, sum: 3 },
      batchMessagesCount: { min: 1, max: 2, sum: 3 },
      globalContextBytes: { min: 1, max: 2, sum: 5 },
      userContextBytes: { min: 1, max: 2, sum: 5 },
      featureFlagBytes: { min: 1, max: 2, sum: 5 },
    })
  })

  it('should not collect empty contexts telemetry', () => {
    const { clock } = setupBuilder.build()

    generateBatch({ eventNumber: 1, contextBytesCount: 0, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry.globalContextBytes).not.toBeDefined()
    expect(telemetryEvents[0].telemetry.userContextBytes).not.toBeDefined()
    expect(telemetryEvents[0].telemetry.featureFlagBytes).not.toBeDefined()
  })

  it('should not collect contexts telemetry of a unfinished batches', () => {
    const { clock } = setupBuilder.build()

    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.VIEW } as RumEvent & Context)
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry).toEqual(
      jasmine.objectContaining({
        batchCount: 1,
        batchBytesCount: { min: 1, max: 1, sum: 1 },
        batchMessagesCount: { min: 1, max: 1, sum: 1 },
        globalContextBytes: { min: 1, max: 1, sum: 1 },
        userContextBytes: { min: 1, max: 1, sum: 1 },
        featureFlagBytes: { min: 1, max: 1, sum: 1 },
      })
    )
  })

  it('should not collect customer data telemetry when telemetry disabled', () => {
    const { clock } = setupBuilder
      .withConfiguration({ telemetrySampleRate: 100, customerDataTelemetrySampleRate: 0 })
      .build()

    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })

  it('should not collect customer data telemetry when customer_data_telemetry ff is disabled', () => {
    resetExperimentalFeatures()
    const { clock } = setupBuilder.build()

    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })
})
