import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets.ts'
import { fetchHandlingError } from '../../lib/executionUtils.ts'

const ONE_DAY_IN_SECOND = 24 * 60 * 60

interface DatadogResponse {
  series?: Array<{
    pointlist?: Array<[number, number | null]>
    tag_set?: string[]
  }>
}

export interface PerformanceMetric {
  name: string
  value: number
}

export async function fetchBundleSizes(commitId: string): Promise<PerformanceMetric[]> {
  const series = await queryMetrics(`avg:browser_sdk.bundle_size.uncompressed{commit:${commitId}} by {bundle_name}`)
  const bundleSizes: PerformanceMetric[] = []
  for (const { tag_set: tagSet, pointlist } of series) {
    const name = tagSet?.find((tag) => tag.startsWith('bundle_name:'))?.slice('bundle_name:'.length)
    const value = getFirstValue(pointlist)
    if (name && value !== undefined) {
      bundleSizes.push({ name, value })
    }
  }
  return bundleSizes
}

export async function fetchPerformanceMetrics(
  type: string,
  names: string[],
  commitId: string
): Promise<PerformanceMetric[]> {
  return (await Promise.all(names.map((name) => fetchMetric(type, name, commitId)))).filter(
    (metric): metric is PerformanceMetric => !!metric
  )
}

async function fetchMetric(type: string, name: string, commitId: string): Promise<PerformanceMetric | undefined> {
  let query = ''

  switch (type) {
    // TODO: remove once commits reported with one metric per bundle are older than the 30 days window
    case 'legacyBundle':
      query = `avg:bundle_sizes.${name}{commit:${commitId}}`
      break
    case 'cpu':
      query = `avg:cpu.sdk.${name}.performance.average{commitid:${commitId}}`
      break
    case 'memory':
      query = `avg:memory.sdk.${name}.performance.bytes{commit:${commitId}}`
      break
  }

  const series = await queryMetrics(query)
  const value = getFirstValue(series[0]?.pointlist)
  if (value !== undefined) {
    return { name, value }
  }
}

// Grouped series are aligned on the same time buckets, so they can contain null points
function getFirstValue(pointlist: Array<[number, number | null]> | undefined): number | undefined {
  return pointlist?.find((point): point is [number, number] => point[1] !== null)?.[1]
}

async function queryMetrics(query: string): Promise<NonNullable<DatadogResponse['series']>> {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND

  const response = await fetchHandlingError(
    `https://api.datadoghq.com/api/v1/query?query=${encodeURIComponent(query)}&from=${date}&to=${now}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': getOrg2ApiKey(),
        'DD-APPLICATION-KEY': getOrg2AppKey(),
      },
    }
  )
  const data = (await response.json()) as DatadogResponse
  return data.series ?? []
}
