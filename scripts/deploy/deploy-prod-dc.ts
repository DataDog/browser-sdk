import { parseArgs } from 'node:util'
import { getBuildEnvValue } from '../lib/buildEnv.ts'
import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { DatacenterType, getAllDatacentersMetadata } from '../lib/datacenter.ts'
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

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(...process.argv.slice(2)))
}

export async function main(...args: string[]): Promise<void> {
  const {
    values: { 'check-telemetry-errors': checkTelemetryErrorsFlag },
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
  const datacenters = await getDatacenters(positionals[1])

  if (!datacenters) {
    throw new Error('DATACENTER argument is required')
  }

  // Skip all telemetry error checks for gov datacenter deployments
  const shouldCheckTelemetryErrors = checkTelemetryErrorsFlag && !datacenters.every((dc) => dc === 'gov')

  if (shouldCheckTelemetryErrors) {
    // Make sure system is in a good state before deploying
    const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]
    await checkTelemetryErrors(datacenters, `${currentBrowserSdkVersionMajor}.*`)
  }

  const uploadPathTypes = toDatacenterUploadPathType(datacenters).join(',')

  console.log('SDK_VERSION', getBuildEnvValue('SDK_VERSION'))

  printLog(`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPathTypes}`)
  printLog(`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPathTypes}`)

  if (shouldCheckTelemetryErrors) {
    await gateTelemetryErrors(datacenters)
  }
}

async function gateTelemetryErrors(datacenters: string[]): Promise<void> {
  printLog(`Check telemetry errors for ${datacenters.join(',')} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)
  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    await checkTelemetryErrors(datacenters, browserSdkVersion)
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }

  printLog() // new line
}

async function getDatacenters(datacenterGroup: string): Promise<string[]> {
  const datacenters = await getAllDatacentersMetadata()

  if (datacenterGroup === 'minor-dcs') {
    return datacenters.filter((dc) => dc.type === DatacenterType.MINOR).map((dc) => dc.name)
  }

  if (datacenterGroup === 'private-regions') {
    return datacenters.filter((dc) => dc.type === DatacenterType.PRIVATE).map((dc) => dc.name)
  }

  return datacenterGroup.split(',')
}

function toDatacenterUploadPathType(datacenters: string[]): string[] {
  return datacenters.map((datacenter) => {
    if (datacenter === 'gov') {
      return 'root'
    }

    return datacenter
  })
}
