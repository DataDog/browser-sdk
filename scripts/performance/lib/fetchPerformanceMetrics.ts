import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets.ts'
import { fetchHandlingError } from '../../lib/executionUtils.ts'

const ONE_DAY_IN_SECOND = 24 * 60 * 60

interface Metric {
  name: string
  value: number | null
}

interface DatadogResponse {
  series?: Array<{
    pointlist?: Array<[number, number]>
  }>
}

export function fetchPerformanceMetrics(type: string, names: string[], commitId: string): Promise<Metric[]> {
  return Promise.all(names.map((name) => fetchMetric(type, name, commitId)))
}

async function fetchMetric(type: string, name: string, commitId: string): Promise<Metric> {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  let query = ''

  switch (type) {
    case 'bundle':
      query = `avg:bundle_sizes.${name}{commit:${commitId}}&from=${date}&to=${now}`
      break
    case 'cpu':
      query = `avg:cpu.sdk.${name}.performance.average{commitid:${commitId}}&from=${date}&to=${now}`
      break
    case 'memory':
      query = `avg:memory.sdk.${name}.performance.bytes{commit:${commitId}}&from=${date}&to=${now}`
      break
  }

  const response = await fetchHandlingError(`https://api.datadoghq.com/api/v1/query?query=${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': getOrg2ApiKey(),
      'DD-APPLICATION-KEY': getOrg2AppKey(),
    },
  })
  const data = (await response.json()) as DatadogResponse
  if (data.series && data.series.length > 0 && data.series[0].pointlist && data.series[0].pointlist.length > 0) {
    return {
      name,
      value: data.series[0].pointlist[0][1],
    }
  }
  return {
    name,
    value: null,
  }
}
