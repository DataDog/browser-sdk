import type { Context, FlushEvent, Observable, Telemetry } from '@datadog/browser-core'
import { ONE_SECOND, addTelemetryMetrics, setInterval, TelemetryMetrics } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export const MEASURES_PERIOD_DURATION = 10 * ONE_SECOND

interface Measure extends Context {
  min: number
  max: number
  sum: number
}

interface CurrentPeriodMeasures extends Context {
  batchCount: number
  batchBytesCount: Measure
  batchMessagesCount: Measure
}

let currentPeriodMeasures: CurrentPeriodMeasures
let batchHasRumEvent: boolean

export function startCustomerDataTelemetry(
  telemetry: Telemetry,
  lifeCycle: LifeCycle,
  batchFlushObservable: Observable<FlushEvent>
) {
  if (!telemetry.metricsEnabled) {
    return
  }

  initCurrentPeriodMeasures()
  batchHasRumEvent = false
  // We measure the data of every view updates even if there could only be one per batch due to the upsert
  // It means that contexts bytes count sums can be higher than it really is
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, () => {
    batchHasRumEvent = true
  })

  batchFlushObservable.subscribe(({ bytesCount, messagesCount }) => {
    // Don't measure batch that only contains telemetry events to avoid batch sending loop
    // It could happen because after each batch we are adding a customer data measures telemetry event to the next one
    if (!batchHasRumEvent) {
      return
    }
    batchHasRumEvent = false

    currentPeriodMeasures.batchCount += 1
    updateMeasure(currentPeriodMeasures.batchBytesCount, bytesCount)
    updateMeasure(currentPeriodMeasures.batchMessagesCount, messagesCount)
  })

  setInterval(sendCurrentPeriodMeasures, MEASURES_PERIOD_DURATION)
}

function sendCurrentPeriodMeasures() {
  if (currentPeriodMeasures.batchCount === 0) {
    return
  }

  // monitor-until: forever
  addTelemetryMetrics(TelemetryMetrics.CUSTOMER_DATA_METRIC_NAME, currentPeriodMeasures)
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

function initCurrentPeriodMeasures() {
  currentPeriodMeasures = {
    batchCount: 0,
    batchBytesCount: createMeasure(),
    batchMessagesCount: createMeasure(),
  }
}
