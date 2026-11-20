import { fetchRuntimeMetadataService } from './runtimeMetadataService.ts'

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

export async function getDatacenterMetadata(name: string): Promise<Datacenter | undefined> {
  const datacentersMetadata = await getAllDatacentersMetadata()

  return datacentersMetadata.find((dc) => dc.name === name)
}

let cachedDatacentersPromise: Promise<Datacenter[]> | undefined

export function mockDatacenters(datacenters: Datacenter[]): void {
  cachedDatacentersPromise = Promise.resolve(datacenters)
}

export function resetDatacenterCache(): void {
  cachedDatacentersPromise = undefined
}

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
  // Filter for production environment and site flavor only
  const selector =
    'datacenter.environment == "prod" && datacenter.flavor == "site" && datacenter.status != "deprecated"'

  const data = await fetchRuntimeMetadataService<DatacentersResponse>(
    `/v2/datacenters?selector=${encodeURIComponent(selector)}`
  )
  return data.datacenters
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
