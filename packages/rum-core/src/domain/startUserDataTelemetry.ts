import type { BatchFlushEvent, Context, ContextManager, Observable, Telemetry } from '@datadog/browser-core'
import {
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

export const MEASURES_FLUSH_INTERVAL = 10 * ONE_SECOND

type Measure = {
  min: number
  max: number
  sum: number
}

let batchCount: number
let batchBytesCount: Measure
let batchMessagesCount: Measure
let globalContextBytes: Measure
let userContextBytes: Measure
let featureFlagBytes: Measure

let currentBatchGlobalContextBytes: Measure
let currentBatchUserContextBytes: Measure
let currentBatchFeatureFlagBytes: Measure

export function startUserDataTelemetry(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  lifeCycle: LifeCycle,
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  featureFlagContexts: FeatureFlagContexts,
  batchFlushObservable: Observable<BatchFlushEvent>
) {
  const userDataTelemetryEnabled = telemetry.enabled && performDraw(configuration.userDataTelemetrySampleRate)
  if (!userDataTelemetryEnabled || !isExperimentalFeatureEnabled('user_data_telemetry')) {
    return
  }

  initMeasures()
  initCurrentBatchMeasures()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event: RumEvent & Context) => {
    updateMeasure(currentBatchGlobalContextBytes, globalContextManager.getBytesCount())
    updateMeasure(currentBatchUserContextBytes, userContextManager.getBytesCount())

    if ([RumEventType.VIEW, RumEventType.ERROR].includes(event.type as RumEventType)) {
      updateMeasure(currentBatchFeatureFlagBytes, featureFlagContexts.getFeatureFlagBytesCount())
    }
  })

  batchFlushObservable.subscribe(({ bufferBytesCount, bufferMessagesCount }) => {
    batchCount += 1
    updateMeasure(batchBytesCount, bufferBytesCount)
    updateMeasure(batchMessagesCount, bufferMessagesCount)
    mergeMeasure(globalContextBytes, currentBatchGlobalContextBytes)
    mergeMeasure(userContextBytes, currentBatchUserContextBytes)
    mergeMeasure(featureFlagBytes, currentBatchFeatureFlagBytes)
    initCurrentBatchMeasures()
  })

  setInterval(monitor(sendMeasures), MEASURES_FLUSH_INTERVAL)
}

function sendMeasures() {
  if (batchCount === 0) {
    return
  }

  addTelemetryDebug('User data measures', {
    batchCount,
    batchBytesCount,
    batchMessagesCount,
    globalContextBytes: globalContextBytes.sum ? globalContextBytes : undefined,
    userContextBytes: globalContextBytes.sum ? userContextBytes : undefined,
    featureFlagBytes: globalContextBytes.sum ? featureFlagBytes : undefined,
  })
  initMeasures()
}

function createMeasure(): Measure {
  return { min: Infinity, max: 0, sum: 0 }
}

export function updateMeasure(measure: Measure, value: number) {
  measure.sum += value
  measure.min = Math.min(measure.min, value)
  measure.max = Math.max(measure.max, value)
}

export function mergeMeasure(target: Measure, source: Measure) {
  target.sum += source.sum
  target.min = Math.min(target.min, source.min)
  target.max = Math.max(target.max, source.max)
}

function initMeasures() {
  batchCount = 0
  batchBytesCount = createMeasure()
  batchMessagesCount = createMeasure()
  globalContextBytes = createMeasure()
  userContextBytes = createMeasure()
  featureFlagBytes = createMeasure()
}

function initCurrentBatchMeasures() {
  currentBatchGlobalContextBytes = createMeasure()
  currentBatchUserContextBytes = createMeasure()
  currentBatchFeatureFlagBytes = createMeasure()
}
