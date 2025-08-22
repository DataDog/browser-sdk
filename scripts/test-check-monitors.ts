import { printLog, runMain, timeout } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

/**
 * Orchestrate the deployments of the artifacts for specific DCs
 * Usage:
 * node deploy-prod-dc.ts vXXX us1,eu1,... true|false
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

const uploadPath: string = process.argv[3]
const withGateMonitors: boolean = process.argv[4] === 'true'

runMain(async () => {
  command`node ./scripts/deploy/check-monitors.ts ${uploadPath}`.withLogs().run()

  if (withGateMonitors && uploadPath !== 'root') {
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
