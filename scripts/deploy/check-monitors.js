/**
 * Check monitors status
 * Usage:
 * node check-monitors.js us1,eu1,...
 */
const { printLog, runMain, fetch } = require('../lib/execution-utils')
const { getTelemetryOrgApiKey, getTelemetryOrgApplicationKey } = require('../lib/secrets')
const { siteByDatacenter } = require('../lib/datadog-sites')

const monitorIdsByDatacenter = {
  us1: [72055549, 68975047, 110519972],
  eu1: [5855803, 5663834, 9896387],
  us3: [164368, 160677, 329066],
  us5: [22388, 20646, 96049],
  ap1: [858, 859, 2757030],
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
        throw new Error(`Monitor ${monitorStatus.name} is in state ${monitorStatus.overall_state}`)
      }
    }
  }
})

async function fetchMonitorStatus(site, monitorId) {
  const response = await fetch(`https://api.${site}/api/v1/monitor/${monitorId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'DD-API-KEY': getTelemetryOrgApiKey(site),
      'DD-APPLICATION-KEY': getTelemetryOrgApplicationKey(site),
    },
  })
  return JSON.parse(response)
}
