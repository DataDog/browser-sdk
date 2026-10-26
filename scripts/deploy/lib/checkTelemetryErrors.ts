/**
 * Check telemetry errors
 */
import { Agent, fetch, type Response } from 'undici'
import { printLog, timeout, createFetchError } from '../../lib/executionUtils.ts'
import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets.ts'

const TIME_WINDOW_IN_MINUTES = 5
const TELEMETRY_INDEX = 'rum-sdk-telemetry-logs'
// Max values returned per group by level (the API defaults to 10). Must be above the number of datacenters checked
// at once, so that no datacenter is left out.
const GROUP_BY_LIMIT = 50
// Rate limit: 2 requests per 10 seconds. Wait 6 seconds between requests to be safe.
const RATE_LIMIT_DELAY_MS = 6000
const MAX_RETRIES = 3

/**
 * Dedicated HTTP agent for telemetry API calls.
 * This ensures a clean connection pool isolated from other network operations,
 * preventing ECONNRESET errors from stale or conflicting connections.
 */
function createTelemetryAgent(): Agent {
  return new Agent({
    connections: 10, // Limit concurrent connections per host
    keepAliveTimeout: 10000, // 10s keepalive
    keepAliveMaxTimeout: 30000, // 30s max keepalive
  })
}

function getQueries(datacenters: string[], version: string): Query[] {
  // Errors tagged as known issues by the telemetry pipeline are not considered.
  const query = `@ddsource:browser status:error @version:${version} @datacenter:(${datacenters.join(' OR ')}) -@known_issue_status:*`

  // Thresholds apply per datacenter, so every query is grouped by datacenter first.
  return [
    {
      name: 'Telemetry errors',
      query,
      groupBy: ['@datacenter'],
      threshold: 300,
    },
    {
      name: 'Telemetry errors on specific org',
      query,
      groupBy: ['@datacenter', '@org_id'],
      threshold: 100,
    },
    {
      name: 'Telemetry error on specific message',
      query,
      groupBy: ['@datacenter', 'issue.id'],
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
  const queries = getQueries(datacenters, version)

  printLog(
    `Checking telemetry errors for version ${version} across ${datacenters.length} datacenter(s): ${datacenters.join(', ')}`
  )

  const apiKey = getOrg2ApiKey()
  const applicationKey = getOrg2AppKey()

  // Create a fresh HTTP agent for this batch of telemetry checks
  const agent = createTelemetryAgent()

  try {
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      const buckets = await queryLogsApi(apiKey, applicationKey, query, agent)

      for (const datacenter of datacenters) {
        const count = Math.max(
          0,
          ...buckets.filter((bucket) => bucket.by['@datacenter'] === datacenter).map((bucket) => bucket.computes.c0)
        )

        if (count > query.threshold) {
          throw new Error(`[${datacenter}] ${query.name}: found ${count} events (threshold: ${query.threshold}) in the last ${TIME_WINDOW_IN_MINUTES} minutes,
see ${computeLogsLink(query)}`)
        }

        printLog(`[${datacenter}] ${query.name}: found ${count} event(s) (threshold: ${query.threshold})`)
      }

      // Skip rate limit delay after last query
      if (i < queries.length - 1) {
        await timeout(RATE_LIMIT_DELAY_MS)
      }
    }
  } finally {
    // Always close the agent to release resources
    await agent.close()
  }
}

async function queryLogsApi(
  apiKey: string,
  applicationKey: string,
  query: Query,
  agent: Agent,
  attempt: number = 1
): Promise<QueryResultBucket[]> {
  let response: Response
  try {
    response = await fetch('https://api.datadoghq.com/api/v2/logs/analytics/aggregate', {
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
        group_by: query.groupBy.map((facet) => ({
          facet,
          limit: GROUP_BY_LIMIT,
          sort: {
            type: 'measure',
            aggregation: 'count',
          },
        })),
        filter: {
          indexes: [TELEMETRY_INDEX],
          from: `now-${TIME_WINDOW_IN_MINUTES}m`,
          to: 'now',
          query: query.query,
        },
      }),
      // Use dedicated agent to avoid connection pool conflicts.
      dispatcher: agent,
    })
  } catch (error) {
    throw new Error(`Network error on attempt ${attempt}/${MAX_RETRIES} for "${query.name}"`, {
      cause: error,
    })
  }

  if (shouldRetry(response, attempt)) {
    printLog(
      `503 Service Unavailable for "${query.name}", retrying in ${RATE_LIMIT_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`
    )
    await timeout(RATE_LIMIT_DELAY_MS)
    return queryLogsApi(apiKey, applicationKey, query, agent, attempt + 1)
  }

  if (!response.ok) {
    throw new Error(`HTTP error on attempt ${attempt}/${MAX_RETRIES} for "${query.name}"`, {
      cause: await createFetchError(response),
    })
  }

  const data = (await response.json()) as QueryResult

  if (!isValidData(data)) {
    throw new Error(`Unexpected response from the API: ${JSON.stringify(data)}`)
  }

  return data.data.buckets
}

function shouldRetry(response: Response, attempt: number): boolean {
  return response.status === 503 && attempt < MAX_RETRIES
}

function isValidData(data: QueryResult): boolean {
  return (
    data?.data &&
    Array.isArray(data.data.buckets) &&
    data.data.buckets.every((bucket) => bucket.computes && typeof bucket.computes.c0 === 'number')
  )
}

function computeLogsLink(query: Query): string {
  const now = Date.now()
  const timeWindowAgo = now - TIME_WINDOW_IN_MINUTES * 60 * 1000

  const queryParams = new URLSearchParams({
    query: `index:${TELEMETRY_INDEX} ${query.query}`,
    agg_q: query.groupBy.join(','),
    agg_t: 'count',
    viz: 'toplist',
    from_ts: `${timeWindowAgo}`,
    to_ts: `${now}`,
  })

  return `https://app.datadoghq.com/logs?${queryParams.toString()}`
}

interface Query {
  name: string
  query: string
  groupBy: string[]
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
