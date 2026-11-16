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

interface Cordon {
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
 * Fail if a cordon is active on any of the given targets. Datacenter targets also report cordons
 * on their environment (e.g. `prod`).
 *
 * An approved freeze exception can bypass this check by setting the `OVERRIDE_CORDON` variable to
 * the incident or exception link when running the job.
 */
export async function checkCordons(targets: CordonTarget[]): Promise<void> {
  const overrideReason = process.env.OVERRIDE_CORDON?.trim()
  const targetNames = targets.map((target) => target.name).join(', ')

  let cordons: Cordon[]
  try {
    cordons = await fetchActiveCordons(targets)
  } catch (error) {
    if (overrideReason) {
      printWarning(`Failed to check cordons for ${targetNames}, continuing because OVERRIDE_CORDON is set.`, error)
      logOverride(overrideReason)
      return
    }
    throw new Error(`Failed to check cordons for ${targetNames}.\n\n${HOW_TO_OVERRIDE}`, { cause: error })
  }

  if (cordons.length === 0) {
    printLog(`✓ No active cordon for ${targetNames}`)
    return
  }

  const cordonList = cordons.map(formatCordon).join('\n')

  if (overrideReason) {
    printWarning(`Bypassing active cordons for ${targetNames}:\n${cordonList}`)
    logOverride(overrideReason)
    return
  }

  throw new Error(`Active cordons for ${targetNames}:\n${cordonList}\n\n${HOW_TO_OVERRIDE}`)
}

const HOW_TO_OVERRIDE = `To deploy anyway:
  1. Get a freeze exception approved through the freeze exception process.
  2. Run the deploy again with the variable OVERRIDE_CORDON=<incident or exception link>:
     - manual job: set the variable when starting the job
     - deploy-auto step (retries can't set variables): run the same step from the deploy-manual pipeline
     - canary job: run a new pipeline with the variable`

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
