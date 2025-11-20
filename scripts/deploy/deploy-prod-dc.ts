import { parseArgs } from 'node:util'
import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getAllMinorDcs, getAllPrivateDcs } from '../lib/datacenter.ts'

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
    values: { 'check-monitors': checkMonitors },
    positionals,
  } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: {
      'check-monitors': {
        type: 'boolean',
        default: false,
      },
    },
  })

  const version = positionals[0]
  const datacenters = getDatacenters(positionals[1])

  if (!datacenters) {
    throw new Error('DATACENTER argument is required')
  }

  if (checkMonitors) {
    command`node ./scripts/deploy/check-monitors.ts ${datacenters.join(',')}`.withLogs().run()
  }

  const uploadPathTypes = toDatacenterUploadPathType(datacenters).join(',')

  command`node ./scripts/deploy/deploy.ts prod ${version} ${uploadPathTypes}`.withLogs().run()
  command`node ./scripts/deploy/upload-source-maps.ts ${version} ${uploadPathTypes}`.withLogs().run()

  if (checkMonitors) {
    await gateMonitors(datacenters)
  }
}

async function gateMonitors(datacenters: string[]): Promise<void> {
  printLog(`Check monitors for ${datacenters.join(',')} during ${GATE_DURATION / ONE_MINUTE_IN_SECOND} minutes`)

  for (let i = 0; i < GATE_DURATION; i += GATE_INTERVAL) {
    command`node ./scripts/deploy/check-monitors.ts ${datacenters.join(',')}`.run()
    process.stdout.write('.') // progress indicator
    await timeout(GATE_INTERVAL * 1000)
  }

  printLog() // new line
}

function getDatacenters(datacenterGroup: string): string[] {
  if (datacenterGroup === 'minor-dcs') {
    return getAllMinorDcs()
  }

  if (datacenterGroup === 'private-regions') {
    return getAllPrivateDcs()
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
