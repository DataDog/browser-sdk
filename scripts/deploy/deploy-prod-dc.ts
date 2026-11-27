import { parseArgs } from 'node:util'
import { printLog, printWarning, runMain, timeout } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { DatacenterType, getAllDatacentersMetadata } from '../lib/datacenter.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { checkTelemetryErrors } from './lib/checkTelemetryErrors.ts'
import { CORDON_SKIP_EXIT_CODE, findCordonedDatacenters, formatSkippedDatacenters } from './lib/checkCordons.ts'

/**
 * Orchestrate the deployments of the artifacts for specific DCs
 * Usage:
 * node deploy-prod-dc.ts vXXX us1,eu1,... true|false
 *
 * Cordoned datacenters (infra freeze) are skipped: the open datacenters are deployed, and the
 * script exits with CORDON_SKIP_EXIT_CODE so the job shows the skip without stopping the release.
 */
const ONE_MINUTE_IN_SECOND = 60
const GATE_DURATION = 30 * ONE_MINUTE_IN_SECOND
const GATE_INTERVAL = ONE_MINUTE_IN_SECOND

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(async () => {
    const { skippedDatacenters } = await main(...process.argv.slice(2))
    if (skippedDatacenters.length > 0) {
      process.exitCode = CORDON_SKIP_EXIT_CODE
    }
  })
}

export async function main(...args: string[]): Promise<{ skippedDatacenters: string[] }> {
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
  const datacenterGroup = positionals[1]

  if (!datacenterGroup) {
    throw new Error('DATACENTER argument is required')
  }

  const datacenters = await getDatacenters(datacenterGroup)

  if (datacenters.length === 0) {
    printLog('No datacenters found, skipping deployment.')
    return { skippedDatacenters: [] }
  }

  const cordonedDatacenters = await findCordonedDatacenters(datacenters)
  const skippedDatacenters = [...cordonedDatacenters.keys()]
  const openDatacenters = datacenters.filter((dc) => !cordonedDatacenters.has(dc))

  if (openDatacenters.length > 0) {
    if (skippedDatacenters.length > 0) {
      printLog(`Deploying ${openDatacenters.join(',')}, skipping cordoned ${skippedDatacenters.join(',')}`)
    }
    await deploy(version, openDatacenters, checkTelemetryErrorsFlag)
  }

  if (skippedDatacenters.length > 0) {
    printWarning(formatSkippedDatacenters(cordonedDatacenters))
  }

  return { skippedDatacenters }
}

async function deploy(version: string, datacenters: string[], checkTelemetryErrorsFlag: boolean): Promise<void> {
  // Skip all telemetry error checks for gov datacenter deployments
  const isGovOnly = datacenters.every((dc) => dc === 'gov')
  const shouldCheckTelemetryErrors = checkTelemetryErrorsFlag && !isGovOnly

  if (shouldCheckTelemetryErrors) {
    // Make sure system is in a good state before deploying
    const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]
    await checkTelemetryErrors(datacenters, `${currentBrowserSdkVersionMajor}.*`)
  }

  const uploadPathTypes = toDatacenterUploadPathType(datacenters).join(',')

  command`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPathTypes}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPathTypes}`.withLogs().run()

  if (shouldCheckTelemetryErrors) {
    await gateTelemetryErrors(datacenters)
  }
}

async function gateTelemetryErrors(datacenters: string[]): Promise<void> {
  printLog(`Check telemetry errors for ${datacenters.join(',')} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)

  const startTime = Date.now()
  const endTime = startTime + GATE_DURATION * 1000

  while (Date.now() < endTime) {
    await checkTelemetryErrors(datacenters, browserSdkVersion)
    const elapsed = Math.round((Date.now() - startTime) / 1000 / 60)
    printLog(`✓ Check completed (${elapsed}/${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes)`)
    await timeout(GATE_INTERVAL * 1000)
  }
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
