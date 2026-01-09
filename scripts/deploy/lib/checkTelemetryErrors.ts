/**
 * Check telemetry errors
 */
import { printLog, fetchHandlingError } from '../../lib/executionUtils.ts'
import { getTelemetryOrgApiKey, getTelemetryOrgApplicationKey } from '../../lib/secrets.ts'
import { getSite } from '../../lib/datacenter.ts'

const TIME_WINDOW_IN_MINUTES = 5

function getQueries(version: string): Query[] {
  const query = `source:browser status:error version:${version}`

  return [
    {
      name: 'Telemetry errors',
      query,
      threshold: 300,
    },
    {
      name: 'Telemetry errors on specific org',
      query,
      groupBy: '@org_id',
      threshold: 100,
    },
    {
      name: 'Telemetry error on specific message',
      query,
      groupBy: 'issue.id',
      threshold: 100,
    },
  ]
}

/**
 * Check telemetry errors for given datacenters
 *
 * @param datacenters - Array of datacenter names to check
 * @param version - Browser SDK version to check errors for
 */
export async function checkTelemetryErrors(datacenters: string[], version: string): Promise<void> {
  const queries = getQueries(version)

  for (const datacenter of datacenters) {
    const site = await getSite(datacenter)

    if (!site) {
      printLog(`No site is configured for datacenter ${datacenter}. skipping...`)
      continue
    }

    const apiKey = getTelemetryOrgApiKey(site)
    const applicationKey = getTelemetryOrgApplicationKey(site)

    if (!apiKey || !applicationKey) {
      printLog(`No API key or application key found for ${site}, skipping...`)
      continue
    }

    for (const query of queries) {
      const buckets = await queryLogsApi(site, apiKey, applicationKey, query)

      // buckets are sorted by count, so we only need to check the first one
      if (buckets[0]?.computes?.c0 > query.threshold) {
        throw new Error(`${query.name} found in the last ${TIME_WINDOW_IN_MINUTES} minutes,
see ${computeLogsLink(site, query)}`)
      }
    }
  }
}

async function queryLogsApi(
  site: string,
  apiKey: string,
  applicationKey: string,
  query: Query
): Promise<QueryResultBucket[]> {
  const response = await fetchHandlingError(`https://api.${site}/api/v2/logs/analytics/aggregate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': applicationKey,
    },
    body: JSON.stringify({
      compute: [
        {
          aggregation: 'count',
        },
      ],
      ...(query.groupBy
        ? {
            group_by: [
              {
                facet: query.groupBy,
                sort: {
                  type: 'measure',
                  aggregation: 'count',
                },
              },
            ],
          }
        : {}),
      filter: {
        from: `now-${TIME_WINDOW_IN_MINUTES}m`,
        to: 'now',
        query: query.query,
      },
    }),
  })

  const data = (await response.json()) as QueryResult

  if (
    !data ||
    !data.data ||
    !Array.isArray(data.data.buckets) ||
    !data.data.buckets.every((bucket) => bucket.computes && typeof bucket.computes.c0 === 'number')
  ) {
    throw new Error(`Unexpected response from the API: ${JSON.stringify(data)}`)
  }

  return data.data.buckets
}

function computeLogsLink(site: string, query: Query): string {
  const now = Date.now()
  const timeWindowAgo = now - TIME_WINDOW_IN_MINUTES * 60 * 1000

  const queryParams = new URLSearchParams({
    query: query.query,
    ...(query.groupBy
      ? {
          agg_q: query.groupBy,
          agg_t: 'count',
          viz: 'toplist',
        }
      : {}),
    from_ts: `${timeWindowAgo}`,
    to_ts: `${now}`,
  })

  return `https://${computeTelemetryOrgDomain(site)}/logs?${queryParams.toString()}`
}

function computeTelemetryOrgDomain(site: string): string {
  switch (site) {
    case 'datadoghq.com':
    case 'datadoghq.eu':
      return `dd-rum-telemetry.${site}`
    default:
      return site
  }
}

interface Query {
  name: string
  query: string
  groupBy?: string
  threshold: number
}

interface QueryResult {
  data: {
    buckets: QueryResultBucket[]
  }
}

export interface QueryResultBucket {
  by: { [key: string]: number | string }
  computes: { c0: number }
}
