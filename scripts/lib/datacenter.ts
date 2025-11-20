import { command } from './command.ts'

// Major DCs are the ones that are deployed last.
// They have their own step jobs in `deploy-manual.yml` and `deploy-auto.yml`.
const MAJOR_DCS = ['gov', 'us1', 'eu1']

export function getSite(datacenter: string): string {
  return getAllDatacentersMetadata()[datacenter].site
}

export function getAllDatacenters(): string[] {
  return Object.keys(getAllDatacentersMetadata())
}

export function getAllMinorDcs(): string[] {
  return getAllDatacenters().filter((dc) => !MAJOR_DCS.includes(dc) && !dc.startsWith('pr'))
}

export function getAllPrivateDcs(): string[] {
  return getAllDatacenters().filter((dc) => dc.startsWith('pr'))
}

interface Datacenter {
  name: string
  site: string
}

let cachedDatacenters: Record<string, Datacenter> | undefined

function getAllDatacentersMetadata(): Record<string, Datacenter> {
  if (cachedDatacenters) {
    return cachedDatacenters
  }

  const selector = 'datacenter.environment == "prod" && datacenter.flavor == "site"'
  const rawDatacenters = command`ddtool datacenters list --selector ${selector}`.run().trim()
  const jsonDatacenters = JSON.parse(rawDatacenters) as Datacenter[]

  cachedDatacenters = {}

  for (const datacenter of jsonDatacenters) {
    const shortName = datacenter.name.split('.')[0]

    cachedDatacenters[shortName] = {
      name: datacenter.name,
      site: datacenter.site,
    }
  }

  return cachedDatacenters
}
