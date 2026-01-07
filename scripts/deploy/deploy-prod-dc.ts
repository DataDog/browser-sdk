import { parseArgs } from 'node:util'
import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { siteByDatacenter } from '../lib/datacenter.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { checkTelemetryErrors } from './lib/checkTelemetryErrors.ts'

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

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(...process.argv.slice(2)))
}

export async function main(...args: string[]): Promise<void> {
  const {
    values: { 'check-telemetry-errors': shouldCheckTelemetryErrors },
    positionals,
  } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: {
      'check-telemetry-errors': {
        type: 'boolean',
        default: false,
      },
    },
  })

  const version = positionals[0]
  const uploadPath = positionals[1] === 'minor-dcs' ? getAllMinorDcs().join(',') : positionals[1]

  if (!uploadPath) {
    throw new Error('UPLOAD_PATH argument is required')
  }

  if (shouldCheckTelemetryErrors) {
    // Make sure system is in a good state before deploying
    const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]
    await checkTelemetryErrors(uploadPath.split(','), `${currentBrowserSdkVersionMajor}.*`)
  }

  command`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPath}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPath}`.withLogs().run()

  if (shouldCheckTelemetryErrors && uploadPath !== 'root') {
    await gateMonitors(uploadPath)
  }
}

async function gateMonitors(uploadPath: string): Promise<void> {
  printLog(`Check monitors for ${uploadPath} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)
  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    await checkTelemetryErrors(uploadPath.split(','), browserSdkVersion)
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }
  printLog() // new line
}
