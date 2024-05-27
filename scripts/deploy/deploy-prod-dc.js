const { printLog, runMain, timeout } = require('../lib/execution-utils')
const { command } = require('../lib/command')

/**
 * Orchestrate the deployments of the artifacts for specific DCs
 * Usage:
 * node deploy-prod-dc.js vXXX us1,eu1,... true|false
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

const version = process.argv[2]
const uploadPath = process.argv[3]
const withGateMonitors = process.argv[4] === 'true'

runMain(async () => {
  command`node ./scripts/deploy/check-monitors.js ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/deploy.js prod ${version} ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.js ${version} ${uploadPath}`.withLogs().run()

  if (withGateMonitors && uploadPath !== 'root') {
    await gateMonitors(uploadPath)
  }
})

async function gateMonitors(uploadPath) {
  printLog(`Check monitors for ${uploadPath} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)
  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    command`node ./scripts/deploy/check-monitors.js ${uploadPath}`.run()
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }
  printLog() // new line
}
