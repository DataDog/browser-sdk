/**
 * Check monitors status
 * Usage:
 * node check-monitors.ts us1,eu1,...
 */
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { getTelemetryOrgApiKey, getTelemetryOrgApplicationKey } from '../lib/secrets.ts'
import { monitorIdsByDatacenter, siteByDatacenter } from '../lib/datacenter.ts'

interface MonitorStatus {
  id: number
  name: string
  overall_state: string
}

const datacenters = process.argv[2].split(',')

runMain(async () => {
  for (const datacenter of datacenters) {
    if (!monitorIdsByDatacenter[datacenter]) {
      printLog(`No monitors configured for datacenter ${datacenter}`)
      continue
    }
    const monitorIds = monitorIdsByDatacenter[datacenter]
    const site = siteByDatacenter[datacenter]
    const monitorStatuses = await Promise.all(monitorIds.map((monitorId) => fetchMonitorStatus(site, monitorId)))
    for (const monitorStatus of monitorStatuses) {
      printLog(`${monitorStatus.overall_state} - ${monitorStatus.name}`)
      if (monitorStatus.overall_state !== 'OK') {
        throw new Error(
          `Monitor ${monitorStatus.name} is in state ${monitorStatus.overall_state}, see ${computeMonitorLink(site, monitorStatus.id)}`
        )
      }
    }
  }
})

async function fetchMonitorStatus(site: string, monitorId: number): Promise<MonitorStatus> {
  const response = await fetchHandlingError(`https://api.${site}/api/v1/monitor/${monitorId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'DD-API-KEY': getTelemetryOrgApiKey(site),
      'DD-APPLICATION-KEY': getTelemetryOrgApplicationKey(site),
    },
  })
  return response.json() as Promise<MonitorStatus>
}

function computeMonitorLink(site: string, monitorId: number): string {
  return `https://${computeTelemetryOrgDomain(site)}/monitors/${monitorId}`
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
