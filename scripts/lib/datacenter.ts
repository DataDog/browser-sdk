import { fetchHandlingError } from './executionUtils.ts'

// Major DCs are the ones that are deployed last.
// They have their own step jobs in `deploy-manual.yml` and `deploy-auto.yml`.
const MAJOR_DCS = ['gov', 'us1', 'eu1']

const VAULT_ADDR = process.env.VAULT_ADDR || 'https://vault.us1.ddbuild.io'
const RUNTIME_METADATA_SERVICE_URL = 'https://runtime-metadata-service.us1.ddbuild.io/v2/datacenters'

export async function getSite(datacenter: string): Promise<string> {
  return (await getAllDatacentersMetadata())[datacenter].site
}

export async function getAllDatacenters(): Promise<string[]> {
  return Object.keys(await getAllDatacentersMetadata())
}

export async function getAllMinorDcs(): Promise<string[]> {
  return (await getAllDatacenters()).filter((dc) => !MAJOR_DCS.includes(dc) && !dc.startsWith('pr'))
}

export async function getAllPrivateDcs(): Promise<string[]> {
  return (await getAllDatacenters()).filter((dc) => dc.startsWith('pr'))
}

interface Datacenter {
  name: string
  site: string
}

interface DatacentersResponse {
  datacenters: Datacenter[]
}

let cachedDatacenters: Record<string, Datacenter> | undefined

async function getAllDatacentersMetadata(): Promise<Record<string, Datacenter>> {
  if (cachedDatacenters) {
    return cachedDatacenters
  }

  const datacenters = await fetchDatacentersFromRuntimeMetadataService()
  cachedDatacenters = {}

  for (const datacenter of datacenters) {
    const shortName = datacenter.name.split('.')[0]

    cachedDatacenters[shortName] = {
      name: datacenter.name,
      site: datacenter.site,
    }
  }

  return cachedDatacenters
}

async function fetchDatacentersFromRuntimeMetadataService(): Promise<Datacenter[]> {
  const token = await getVaultToken()

  // Filter for production environment and site flavor only
  const selector = 'datacenter.environment == "prod" && datacenter.flavor == "site"'

  const response = await fetchHandlingError(
    `${RUNTIME_METADATA_SERVICE_URL}?selector=${encodeURIComponent(selector)}`,
    {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  const data = (await response.json()) as DatacentersResponse
  return data.datacenters
}

async function getVaultToken(): Promise<string> {
  const response = await fetchHandlingError(`${VAULT_ADDR}/v1/identity/oidc/token/runtime-metadata-service`, {
    headers: {
      'X-Vault-Request': 'true',
    },
  })

  const data = (await response.json()) as { data: { token: string } }
  return data.data.token
}
