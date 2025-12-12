/**
 * Check monitors status
 * Usage:
 * node check-monitors.ts us1,eu1,...
 */
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { getTelemetryOrgApiKey, getTelemetryOrgApplicationKey } from '../lib/secrets.ts'
import { getSite } from '../lib/datacenter.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'

const datacenters = process.argv[2].split(',')

runMain(async () => {
  for (const datacenter of datacenters) {
    const site = getSite(datacenter)
    const apiKey = getTelemetryOrgApiKey(site)
    const applicationKey = getTelemetryOrgApplicationKey(site)

    if (!apiKey || !applicationKey) {
      printLog(`No API key or application key found for ${site}, skipping...`)
      continue
    }

    const errorLogsCount = await queryErrorLogsCount(site, apiKey, applicationKey)

    if (errorLogsCount > 0) {
      throw new Error(`Errors found in the last 30 minutes,
see ${computeMonitorLink(site)}`)
    } else {
      printLog(`No errors found in the last 30 minutes for ${datacenter}`)
    }
  }
})

async function queryErrorLogsCount(site: string, apiKey: string, applicationKey: string): Promise<number> {
  const response = await fetchHandlingError(`https://api.${site}/api/v2/logs/events/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': applicationKey,
    },
    body: JSON.stringify({
      filter: {
        from: 'now-30m',
        to: 'now',
        query: `source:browser status:error version:${browserSdkVersion}`,
      },
    }),
  })

  const data = (await response.json()) as { data: unknown[] }

  return data.data.length
}

function computeMonitorLink(site: string): string {
  const now = Date.now()
  const thirtyMinutesAgo = now - 30 * 60 * 1000

  const queryParams = new URLSearchParams({
    query: `source:browser status:error version:${browserSdkVersion}`,
    from_ts: `${thirtyMinutesAgo}`,
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
