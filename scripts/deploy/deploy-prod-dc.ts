import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { siteByDatacenter } from '../lib/datadogSites.ts'

/**
 * Orchestrate the deployments of the artifacts for specific DCs
 * Usage:
 * node deploy-prod-dc.ts vXXX us1,eu1,... true|false
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

const version: string = process.argv[2]
const uploadPath: string = process.argv[3] === 'minor-dcs' ? getAllMinorDcs().join(',') : process.argv[3]
const withMonitorChecks: boolean = process.argv[4] === 'true'

runMain(async () => {
  if (withMonitorChecks) {
    command`node ./scripts/deploy/check-monitors.ts ${uploadPath}`.withLogs().run()
  }

  command`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPath}`.withLogs().run()

  if (withMonitorChecks && uploadPath !== 'root') {
    await gateMonitors(uploadPath)
  }
})

async function gateMonitors(uploadPath: string): Promise<void> {
  printLog(`Check monitors for ${uploadPath} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)
  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    command`node ./scripts/deploy/check-monitors.ts ${uploadPath}`.run()
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }
  printLog() // new line
}

// Major DCs are the ones that are deployed last.
// They have their own step jobs in `deploy-manual.yml` and `deploy-auto.yml`.
const MAJOR_DCS = ['root', 'us1', 'eu1']

// Minor DCs are all the DCs from `siteByDatacenter` that are not in `MAJOR_DCS`.
function getAllMinorDcs(): string[] {
  return Object.keys(siteByDatacenter).filter((dc) => !MAJOR_DCS.includes(dc))
}
