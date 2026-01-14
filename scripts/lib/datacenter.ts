import { fetchHandlingError } from './executionUtils.ts'

export const DatacenterType = {
  // Minor DCs are the ones that are deployed first, all at once.
  MINOR: 'minor',

  // Private DCs are deployed next, all at once
  PRIVATE: 'private',

  // Major DCs are the ones that are deployed last, one after the other.
  // (i.e. they have their own step jobs in `deploy-manual.yml` and `deploy-auto.yml`)
  MAJOR: 'major',
} as const

export type DatacenterType = (typeof DatacenterType)[keyof typeof DatacenterType]

export interface Datacenter {
  name: string
  site: string
  type: DatacenterType
}

interface DatacentersResponse {
  datacenters: Array<{
    name: string
    site: string
  }>
}

const MAJOR_DCS = ['gov', 'us1', 'eu1']

const VAULT_ADDR = process.env.VAULT_ADDR || 'https://vault.us1.ddbuild.io'
const RUNTIME_METADATA_SERVICE_URL = 'https://runtime-metadata-service.us1.ddbuild.io/v2/datacenters'

console.log('process.env.VAULT_ADDR', process.env.VAULT_ADDR)

export async function getDatacenterMetadata(name: string): Promise<Datacenter | undefined> {
  const datacentersMetadata = await getAllDatacentersMetadata()

  return datacentersMetadata.find((dc) => dc.name === name)
}

let cachedDatacentersPromise: Promise<Datacenter[]> | undefined

export function getAllDatacentersMetadata(): Promise<Datacenter[]> {
  if (cachedDatacentersPromise) {
    return cachedDatacentersPromise
  }

  cachedDatacentersPromise = fetchDatacentersFromRuntimeMetadataService().then((datacenters) => {
    const cachedDatacenters: Datacenter[] = []

    for (const datacenter of datacenters) {
      const shortName = datacenter.name.split('.')[0]

      cachedDatacenters.push({
        name: shortName,
        site: datacenter.site,
        type: getDatacenterType(shortName),
      })
    }

    return cachedDatacenters
  })

  return cachedDatacentersPromise
}

async function fetchDatacentersFromRuntimeMetadataService(): Promise<DatacentersResponse['datacenters']> {
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

function getDatacenterType(name: string): DatacenterType {
  if (name.startsWith('pr')) {
    return DatacenterType.PRIVATE
  }

  if (MAJOR_DCS.includes(name)) {
    return DatacenterType.MAJOR
  }

  return DatacenterType.MINOR
}
