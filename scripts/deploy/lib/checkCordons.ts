import { printLog, printWarning } from '../../lib/executionUtils.ts'
import { fetchRuntimeMetadataService } from '../../lib/runtimeMetadataService.ts'

/**
 * Infrastructure to check for active cordons, using Runtime Metadata Service names
 * (e.g. `{ type: 'datacenter', name: 'us1.prod.dog' }` or `{ type: 'environment', name: 'prod' }`).
 */
export interface CordonTarget {
  type: 'datacenter' | 'environment'
  name: string
}

export interface Cordon {
  name: string
  resourceType: string
  resourceId: string
  incidentId?: string
  description?: string
  createdBy?: string
  soft?: boolean
}

interface ListCordonsResponse {
  cordons: Cordon[]
  nextPageToken?: string
}

const GOV_DATACENTERS = ['us1.fed.dog', 'us2.fed.dog']

/**
 * Map a browser-sdk datacenter name (as used by deploy-prod-dc.ts) to the cordon targets to check.
 */
export function datacenterToCordonTargets(datacenter: string): CordonTarget[] {
  if (datacenter === 'gov') {
    return GOV_DATACENTERS.map((name) => ({ type: 'datacenter', name }))
  }

  return [{ type: 'datacenter', name: `${datacenter}.prod.dog` }]
}

/**
 * Exit code of a deploy step that skipped cordoned datacenters. The CDN deploy jobs allow this exit
 * code only (`allow_failure: exit_codes` in .gitlab/deploy-{auto,manual}.yml), so the release goes
 * on while any other failure still stops it.
 */
export const CORDON_SKIP_EXIT_CODE = 75

/**
 * Fail if a cordon is active on any of the given targets. Datacenter targets also report cordons
 * on their environment (e.g. `prod`).
 *
 * An approved freeze exception can bypass this check by setting the `OVERRIDE_CORDON` variable to
 * the incident or exception link when running the job.
 */
export async function checkCordons(targets: CordonTarget[]): Promise<void> {
  const cordons = await getBlockingCordons(new Map([['targets', targets]]))

  if (cordons.size > 0) {
    throw new Error(
      `Active cordons for ${formatTargetNames(targets)}:\n${formatCordons(cordons)}\n\n${HOW_TO_OVERRIDE}`
    )
  }
}

/**
 * Return the active cordons of each cordoned browser-sdk datacenter (e.g. `us1`, `gov`). Open
 * datacenters are not in the returned map.
 *
 * Like `checkCordons`, `OVERRIDE_CORDON` bypasses the cordons (the returned map is empty), and an
 * error while fetching the cordons is thrown unless `OVERRIDE_CORDON` is set.
 */
export function findCordonedDatacenters(datacenters: string[]): Promise<Map<string, Cordon[]>> {
  return getBlockingCordons(
    new Map(datacenters.map((datacenter) => [datacenter, datacenterToCordonTargets(datacenter)]))
  )
}

export function formatSkippedDatacenters(cordonedDatacenters: Map<string, Cordon[]>): string {
  return `Skipped cordoned datacenters: ${[...cordonedDatacenters.keys()].join(', ')}
${formatCordons(cordonedDatacenters)}

The skipped datacenters keep their previous version. After the freeze, run the same step from the
deploy-manual pipeline of this release tag, unless a newer release was already deployed there.

${HOW_TO_OVERRIDE}`
}

const HOW_TO_OVERRIDE = `To deploy anyway:
  1. Get a freeze exception approved through the freeze exception process.
  2. Run the deploy again with the variable OVERRIDE_CORDON=<incident or exception link>:
     - manual job: set the variable when starting the job
     - deploy-auto step (retries can't set variables): run the same step from the deploy-manual pipeline
     - canary job: run a new pipeline with the variable`

/**
 * Fetch the active cordons of each group of targets, and keep only the groups with active cordons.
 * Return an empty map when `OVERRIDE_CORDON` bypasses the cordons.
 */
async function getBlockingCordons(targetsByGroup: Map<string, CordonTarget[]>): Promise<Map<string, Cordon[]>> {
  const overrideReason = process.env.OVERRIDE_CORDON?.trim()
  const targetNames = formatTargetNames([...targetsByGroup.values()].flat())

  const cordonsByGroup = new Map<string, Cordon[]>()
  try {
    for (const [group, targets] of targetsByGroup) {
      const cordons = await fetchActiveCordons(targets)
      if (cordons.length > 0) {
        cordonsByGroup.set(group, cordons)
      }
    }
  } catch (error) {
    if (overrideReason) {
      printWarning(`Failed to check cordons for ${targetNames}, continuing because OVERRIDE_CORDON is set.`, error)
      logOverride(overrideReason)
      return new Map()
    }
    throw new Error(`Failed to check cordons for ${targetNames}.\n\n${HOW_TO_OVERRIDE}`, { cause: error })
  }

  if (cordonsByGroup.size === 0) {
    printLog(`✓ No active cordon for ${targetNames}`)
    return cordonsByGroup
  }

  if (overrideReason) {
    printWarning(`Bypassing active cordons for ${targetNames}:\n${formatCordons(cordonsByGroup)}`)
    logOverride(overrideReason)
    return new Map()
  }

  return cordonsByGroup
}

async function fetchActiveCordons(targets: CordonTarget[]): Promise<Cordon[]> {
  const cordonsByName = new Map<string, Cordon>()

  for (const target of targets) {
    const basePath = `/v2/${target.type === 'datacenter' ? 'datacenters' : 'environments'}/${encodeURIComponent(target.name)}/cordons`
    let pageToken = ''

    do {
      const path = pageToken ? `${basePath}?pageToken=${encodeURIComponent(pageToken)}` : basePath
      const response = await fetchRuntimeMetadataService<ListCordonsResponse>(path)

      for (const cordon of response.cordons) {
        cordonsByName.set(cordon.name, cordon)
      }

      pageToken = response.nextPageToken ?? ''
    } while (pageToken)
  }

  return [...cordonsByName.values()]
}

function formatTargetNames(targets: CordonTarget[]): string {
  return targets.map((target) => target.name).join(', ')
}

/**
 * Format the cordons of all groups, listing a cordon shared by several groups (e.g. an environment
 * cordon) only once.
 */
function formatCordons(cordonsByGroup: Map<string, Cordon[]>): string {
  const cordonsByName = new Map([...cordonsByGroup.values()].flat().map((cordon) => [cordon.name, cordon]))
  return [...cordonsByName.values()].map(formatCordon).join('\n')
}

function formatCordon(cordon: Cordon): string {
  const details = [
    `${cordon.resourceType} ${cordon.resourceId}`,
    cordon.soft ? 'soft' : 'hard',
    cordon.incidentId,
    cordon.createdBy,
    cordon.description,
  ].filter(Boolean)

  return `  - ${cordon.name}: ${details.join(', ')}`
}

function logOverride(reason: string): void {
  printWarning(
    `Cordon check overridden by ${process.env.GITLAB_USER_LOGIN ?? 'unknown user'}` +
      ` (job: ${process.env.CI_JOB_URL ?? 'unknown'}). Reason: ${reason}`
  )
}
