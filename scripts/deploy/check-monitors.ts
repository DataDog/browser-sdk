/**
 * Check monitors status
 * Usage:
 * node check-monitors.ts us1,eu1,...
 */
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { getTelemetryOrgApiKey, getTelemetryOrgApplicationKey } from '../lib/secrets.ts'
import { getSite } from '../lib/datacenter.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'

const TIME_WINDOW_IN_MINUTES = 5
const BASE_QUERY = `source:browser status:error version:${browserSdkVersion}`
const QUERIES: Query[] = [
  {
    name: 'Telemetry errors',
    query: BASE_QUERY,
    threshold: 300,
  },
  {
    name: 'Telemetry errors on specific org',
    query: BASE_QUERY,
    facet: '@org_id',
    threshold: 100,
  },
  {
    name: 'Telemetry error on specific message',
    query: BASE_QUERY,
    facet: 'issue.id',
    threshold: 100,
  },
]

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(...process.argv.slice(2)))
}

export async function main(...args: string[]): Promise<void> {
  const datacenters = args[0].split(',')

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

    for (const query of QUERIES) {
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
      ...(query.facet
        ? {
            group_by: [
              {
                facet: query.facet,
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

  return data.data.buckets
}

function computeLogsLink(site: string, query: Query): string {
  const now = Date.now()
  const timeWindowAgo = now - TIME_WINDOW_IN_MINUTES * 60 * 1000

  const queryParams = new URLSearchParams({
    query: query.query,
    ...(query.facet
      ? {
          agg_q: query.facet,
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
  facet?: string
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
