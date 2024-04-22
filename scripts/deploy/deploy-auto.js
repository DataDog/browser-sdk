const { printLog, runMain, timeout } = require('../lib/execution-utils')
const { command } = require('../lib/command')

/**
 * Orchestrate the deployments of all the artifacts of a release
 * Usage:
 * node deploy-auto.js vXXX
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

const version = process.argv[2]

runMain(async () => {
  for await (const uploadPath of ['us3,us5,ap1', 'eu1', 'us1']) {
    deploy(uploadPath)
    await gateMonitors(uploadPath)
  }

  deploy('root') // gov
  command`node ./scripts/deploy/publish-npm.js`.withLogs().run()
  command`node ./scripts/deploy/publish-developer-extension.js`.withLogs().run()
})

function deploy(uploadPath) {
  printLog(`Deploy artifacts for ${uploadPath}`)
  command`node ./scripts/deploy/check-monitors.js ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/deploy.js prod v${version} ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.js prod v${version} ${uploadPath}`.withLogs().run()
}

async function gateMonitors(uploadPath) {
  printLog(`Check monitors for ${uploadPath} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)
  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    command`node ./scripts/deploy/check-monitors.js ${uploadPath}`.run()
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }
  printLog() // new line
}
