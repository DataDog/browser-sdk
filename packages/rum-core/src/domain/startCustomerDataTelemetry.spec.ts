import type { FlushEvent, Context, ContextManager, TelemetryEvent } from '@datadog/browser-core'
import { resetExperimentalFeatures, TelemetryService, startTelemetry, Observable } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../test'
import { setup } from '../../test'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { FeatureFlagContexts } from './contexts/featureFlagContext'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { MEASURES_PERIOD_DURATION, startCustomerDataTelemetry } from './startCustomerDataTelemetry'

describe('customerDataTelemetry', () => {
  let setupBuilder: TestSetupBuilder
  let batchFlushObservable: Observable<FlushEvent>
  let telemetryEvents: TelemetryEvent[]
  let fakeContext: Context
  let fakeContextBytesCount: number
  let lifeCycle: LifeCycle
  const viewEvent = { type: RumEventType.VIEW } as RumEvent & Context

  function generateBatch({
    eventNumber,
    batchBytesCount = 1,
    contextBytesCount = fakeContextBytesCount,
    context = fakeContext,
  }: {
    eventNumber: number
    eventType?: RumEventType | 'Telemetry'
    batchBytesCount?: number
    contextBytesCount?: number
    context?: Context
  }) {
    fakeContextBytesCount = contextBytesCount
    fakeContext = context

    for (let index = 0; index < eventNumber; index++) {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, viewEvent)
    }
    batchFlushObservable.notify({
      reason: 'duration_limit',
      bytesCount: batchBytesCount,
      messagesCount: eventNumber,
    })
  }

  function spyOnContextManager(contextManager: ContextManager) {
    spyOn(contextManager, 'get').and.callFake(() => fakeContext)
    spyOn(contextManager, 'getBytesCount').and.callFake(() => fakeContextBytesCount)
  }

  function spyOnFeatureFlagContexts(featureFlagContexts: FeatureFlagContexts) {
    spyOn(featureFlagContexts, 'findFeatureFlagEvaluations').and.callFake(() => fakeContext)
    spyOn(featureFlagContexts, 'getFeatureFlagBytesCount').and.callFake(() => fakeContextBytesCount)
  }

  beforeEach(() => {
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
        fakeContext = { foo: 'bar' }
        spyOnContextManager(globalContextManager)
        spyOnContextManager(userContextManager)
        spyOnFeatureFlagContexts(featureFlagContexts)

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

    generateBatch({ eventNumber: 10, contextBytesCount: 10, batchBytesCount: 10 })
    generateBatch({ eventNumber: 1, contextBytesCount: 1, batchBytesCount: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents[0].telemetry).toEqual({
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
  })

  it('should collect empty contexts telemetry', () => {
    const { clock } = setupBuilder.build()

    generateBatch({ eventNumber: 1, context: {} })

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
    const { clock } = setupBuilder.build()

    batchFlushObservable.notify({ reason: 'duration_limit', bytesCount: 1, messagesCount: 1 })

    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })

  it('should not collect contexts telemetry of a unfinished batches', () => {
    const { clock } = setupBuilder.build()

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
    const { clock } = setupBuilder
      .withConfiguration({ telemetrySampleRate: 100, customerDataTelemetrySampleRate: 0 })
      .build()

    generateBatch({ eventNumber: 1 })
    clock.tick(MEASURES_PERIOD_DURATION)

    expect(telemetryEvents.length).toEqual(0)
  })
})
