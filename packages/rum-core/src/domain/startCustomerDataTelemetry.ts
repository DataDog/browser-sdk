import type { BatchFlushEvent, Context, ContextManager, Observable, Telemetry } from '@datadog/browser-core'
import {
  includes,
  isExperimentalFeatureEnabled,
  performDraw,
  ONE_SECOND,
  addTelemetryDebug,
  monitor,
} from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { RumConfiguration } from './configuration'
import type { FeatureFlagContexts } from './contexts/featureFlagContext'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export const MEASURES_PERIOD_DURATION = 10 * ONE_SECOND

type Measure = {
  min: number
  max: number
  sum: number
}

type CurrentPeriodMeasures = {
  batchCount: number
  batchBytesCount: Measure
  batchMessagesCount: Measure
  globalContextBytes: Measure
  userContextBytes: Measure
  featureFlagBytes: Measure
}

type CurrentBatchMeasures = {
  globalContextBytes: Measure
  userContextBytes: Measure
  featureFlagBytes: Measure
}

let currentPeriodMeasures: CurrentPeriodMeasures
let currentBatchMeasures: CurrentBatchMeasures

export function startCustomerDataTelemetry(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  lifeCycle: LifeCycle,
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  featureFlagContexts: FeatureFlagContexts,
  batchFlushObservable: Observable<BatchFlushEvent>
) {
  const customerDataTelemetrySampleRate =
    telemetry.enabled && performDraw(configuration.customerDataTelemetrySampleRate)
  if (!customerDataTelemetrySampleRate || !isExperimentalFeatureEnabled('customer_data_telemetry')) {
    return
  }

  initCurrentPeriodMeasures()
  initCurrentBatchMeasures()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event: RumEvent & Context) => {
    updateMeasure(currentBatchMeasures.globalContextBytes, globalContextManager.getBytesCount())
    updateMeasure(currentBatchMeasures.userContextBytes, userContextManager.getBytesCount())

    if (includes([RumEventType.VIEW, RumEventType.ERROR], event.type)) {
      updateMeasure(currentBatchMeasures.featureFlagBytes, featureFlagContexts.getFeatureFlagBytesCount())
    }
  })

  batchFlushObservable.subscribe(({ bufferBytesCount, bufferMessagesCount }) => {
    currentPeriodMeasures.batchCount += 1
    updateMeasure(currentPeriodMeasures.batchBytesCount, bufferBytesCount)
    updateMeasure(currentPeriodMeasures.batchMessagesCount, bufferMessagesCount)
    mergeMeasure(currentPeriodMeasures.globalContextBytes, currentBatchMeasures.globalContextBytes)
    mergeMeasure(currentPeriodMeasures.userContextBytes, currentBatchMeasures.userContextBytes)
    mergeMeasure(currentPeriodMeasures.featureFlagBytes, currentBatchMeasures.featureFlagBytes)
    initCurrentBatchMeasures()
  })

  setInterval(monitor(sendCurrentPeriodMeasures), MEASURES_PERIOD_DURATION)
}

function sendCurrentPeriodMeasures() {
  if (currentPeriodMeasures.batchCount === 0) {
    return
  }
  const { batchCount, batchBytesCount, batchMessagesCount, globalContextBytes, userContextBytes, featureFlagBytes } =
    currentPeriodMeasures
  addTelemetryDebug('Customer data measures', {
    batchCount,
    batchBytesCount,
    batchMessagesCount,
    globalContextBytes: globalContextBytes.sum ? globalContextBytes : undefined,
    userContextBytes: userContextBytes.sum ? userContextBytes : undefined,
    featureFlagBytes: featureFlagBytes.sum ? featureFlagBytes : undefined,
  })
  initCurrentPeriodMeasures()
}

function createMeasure(): Measure {
  return { min: Infinity, max: 0, sum: 0 }
}

function updateMeasure(measure: Measure, value: number) {
  measure.sum += value
  measure.min = Math.min(measure.min, value)
  measure.max = Math.max(measure.max, value)
}

function mergeMeasure(target: Measure, source: Measure) {
  target.sum += source.sum
  target.min = Math.min(target.min, source.min)
  target.max = Math.max(target.max, source.max)
}

function initCurrentPeriodMeasures() {
  currentPeriodMeasures = {
    batchCount: 0,
    batchBytesCount: createMeasure(),
    batchMessagesCount: createMeasure(),
    globalContextBytes: createMeasure(),
    userContextBytes: createMeasure(),
    featureFlagBytes: createMeasure(),
  }
}

function initCurrentBatchMeasures() {
  currentBatchMeasures = {
    globalContextBytes: createMeasure(),
    userContextBytes: createMeasure(),
    featureFlagBytes: createMeasure(),
  }
}
