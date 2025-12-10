import { parseArgs } from 'node:util'
import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { siteByDatacenter } from '../lib/datacenter.ts'

/**
 * Orchestrate the deployments of the artifacts for specific DCs
 * Usage:
 * node deploy-prod-dc.ts vXXX us1,eu1,... true|false
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

// Major DCs are the ones that are deployed last.
// They have their own step jobs in `deploy-manual.yml` and `deploy-auto.yml`.
const MAJOR_DCS = ['root', 'us1', 'eu1']

// Minor DCs are all the DCs from `siteByDatacenter` that are not in `MAJOR_DCS`.
function getAllMinorDcs(): string[] {
  return Object.keys(siteByDatacenter).filter((dc) => !MAJOR_DCS.includes(dc))
}

const {
  values: { 'check-monitors': checkMonitors },
  positionals,
} = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    'check-monitors': {
      type: 'boolean',
    },
  },
})

const version = positionals[0]
const uploadPath = positionals[1] === 'minor-dcs' ? getAllMinorDcs().join(',') : positionals[1]

if (!uploadPath) {
  throw new Error('UPLOAD_PATH argument is required')
}

runMain(async () => {
  if (checkMonitors) {
    command`node ./scripts/deploy/check-monitors.ts ${uploadPath}`.withLogs().run()
  }

  command`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPath}`.withLogs().run()

  if (checkMonitors && uploadPath !== 'root') {
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
