import type { Context } from '@datadog/browser-core'
import { timeStampNow, ONE_SECOND } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { MetricEvent } from '../../metricEvent.types'
import type { PushMetricExporter, MetricData } from './metricsApi'
import { MeterProvider, PeriodicMetricReader } from './metricsApi'

const DEFAULT_SAMPLING_INTERVAL = 5 * ONE_SECOND

export function startMetricCollection(lifecycle: LifeCycle) {
  const datadogExporter: PushMetricExporter = {
    export: (metrics) => {
      const metricEvent = processMetrics(metrics)
      lifecycle.notify(LifeCycleEventType.METRIC_EVENT_COLLECTED, metricEvent as MetricEvent & Context)
    },
  }
  const periodicReader = new PeriodicMetricReader(DEFAULT_SAMPLING_INTERVAL, datadogExporter)
  const defaultMeterProvider = new MeterProvider({
    readers: [periodicReader],
  })

  return {
    defaultMeterProvider,
    datadogExporter,
    stop: () => {
      periodicReader.stop()
    },
  }
}

function processMetrics(metrics: MetricData[]): MetricEvent {
  return {
    date: timeStampNow(),
    type: 'metric',
    metric: {
      type: 'series',
      series: metrics.map((metric) => ({
        metric: metric.name,
        type: 1, // counter
        points: metric.points.map((point) => ({
          value: point.value,
          timestamp: Math.round(point.startTime / 1000),
        })),
      })),
    },
    _dd: {
      format_version: 2,
    },
  }
}
