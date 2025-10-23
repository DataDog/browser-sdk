import type { Metrics } from 'profiling.type'
import { fetchHandlingError } from '../../scripts/lib/executionUtils'
import { getOrg2ApiKey } from '../../scripts/lib/secrets'

interface DatadogSeriesPoint {
  timestamp: number
  value: number
}

interface DatadogSeries {
  metric: string
  type: number
  points: DatadogSeriesPoint[]
  tags: string[]
}

const GAUGE_TYPE = 3
const METRIC_PREFIX = 'browser_sdk.benchmark'

export async function reportToDatadog(metricsTable: Record<string, Metrics>, applicationId: string) {
  const series = convertMetricsToSeries(metricsTable, applicationId)
  const result = await sendToDatadog(series)

  console.log(`Successfully sent ${series.length} metrics to Datadog`)
  return result
}

function convertMetricsToSeries(metricsTable: Record<string, Metrics>, applicationId: string): DatadogSeries[] {
  const timestamp = Math.floor(Date.now() / 1000)
  const series: DatadogSeries[] = []

  for (const [scenario, metrics] of Object.entries(metricsTable)) {
    const tags = [`application_id:${applicationId}`, `scenario:${scenario}`]

    for (const [key, value] of Object.entries(metrics)) {
      series.push({
        metric: `${METRIC_PREFIX}.${key}`,
        type: GAUGE_TYPE,
        points: [{ timestamp, value }],
        tags,
      })
    }
  }

  return series
}

async function sendToDatadog(series: DatadogSeries[]) {
  return await fetchHandlingError('https://api.datadoghq.com/api/v2/series', {
    method: 'POST',
    headers: {
      'DD-API-KEY': getOrg2ApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ series }),
  })
}
