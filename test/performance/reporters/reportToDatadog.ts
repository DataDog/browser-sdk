import { DATADOG_SITE } from '../configuration'
import type { Metrics } from '../profiling.type'
import { fetchHandlingError } from '../../../scripts/lib/executionUtils'
import { getOrg2ApiKey } from '../../../scripts/lib/secrets'

interface DatadogSeries {
  metric: string
  points: Array<[number, Array<[number]>]>
  tags?: string[]
}

const METRIC_PREFIX = 'browser_sdk.benchmark'

export async function reportToDatadog(metricsTable: Record<string, Metrics>, scenarioName: string, sdkVersion: string) {
  const series = convertMetricsToSeries(metricsTable, scenarioName, sdkVersion)
  const result = await sendToDatadog(series)

  console.log(`✅ Successfully sent ${series.length} metrics to Datadog`)
  console.log(
    `📊 View metrics in Datadog: https://app.${DATADOG_SITE}/dashboard/m7i-uke-sa9/rum-browser-sdk-performance`
  )
  return result
}

function convertMetricsToSeries(
  metricsTable: Record<string, Metrics>,
  scenarioName: string,
  sdkVersion: string
): DatadogSeries[] {
  const timestamp = Math.floor(Date.now() / 1000)
  const series: DatadogSeries[] = []

  for (const [configuration, metrics] of Object.entries(metricsTable)) {
    const tags = [`scenario:${scenarioName}`, `configuration:${configuration}`, `sdk_version:${sdkVersion}`]

    for (const [key, value] of Object.entries(metrics)) {
      series.push({
        metric: `${METRIC_PREFIX}.${key}`,
        points: [[timestamp, [value]]],
        tags,
      })
    }
  }

  return series
}

async function sendToDatadog(series: DatadogSeries[]) {
  const apiKey = getOrg2ApiKey()
  const payload = { series }
  const apiUrl = `https://api.${DATADOG_SITE}/api/v1/distribution_points`

  try {
    const response = await fetchHandlingError(apiUrl, {
      method: 'POST',
      headers: {
        'DD-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    return response
  } catch (error) {
    console.error('Error', error, payload)
    throw error
  }
}
