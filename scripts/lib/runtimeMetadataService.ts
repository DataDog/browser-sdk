import { fetchHandlingError } from './executionUtils.ts'

const VAULT_ADDR = process.env.VAULT_ADDR || 'https://vault.us1.ddbuild.io'
const RUNTIME_METADATA_SERVICE_URL = 'https://runtime-metadata-service.us1.ddbuild.io'

/**
 * Fetch a resource from the Runtime Metadata Service (RMS) API.
 *
 * @param path - API path, e.g. `/v2/datacenters?selector=...`
 */
export async function fetchRuntimeMetadataService<T>(path: string): Promise<T> {
  const token = await getVaultToken()

  const response = await fetchHandlingError(`${RUNTIME_METADATA_SERVICE_URL}${path}`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  return (await response.json()) as T
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
