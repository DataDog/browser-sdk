import type { FlagOverrideType } from '../../../hooks/useFlagOverrides'
import { getFlagsApiHost } from './oauth'

export interface CatalogVariant {
  name: string
  value: boolean | string | number | object
}

export interface CatalogFlag {
  key: string
  // Human-friendly display name; falls back to the key when the API doesn't provide one.
  name: string
  type: FlagOverrideType
  variants: CatalogVariant[]
  tags: string[]
  createdBy: string | null
}

export interface CatalogCredentials {
  apiKey: string
  appKey: string
  site: string
}

interface RawFeatureFlagVariant {
  name: string
  value: string
}

interface RawFeatureFlagAttributes {
  key: string
  name?: string
  value_type: FlagOverrideType
  variants?: RawFeatureFlagVariant[]
  tags?: string[]
  created_by?: string
}

interface RawFeatureFlagResource {
  attributes: RawFeatureFlagAttributes
}

interface RawFeatureFlagsResponse {
  data: RawFeatureFlagResource[]
}

// Variant values come back from the API as strings regardless of the flag's declared type.
function parseVariantValue(type: FlagOverrideType, rawValue: string): CatalogVariant['value'] {
  switch (type) {
    case 'BOOLEAN':
      return rawValue === 'true'
    case 'INTEGER':
      return parseInt(rawValue, 10)
    case 'NUMERIC':
      return parseFloat(rawValue)
    case 'JSON':
      return JSON.parse(rawValue) as object
    case 'STRING':
      return rawValue
  }
}

// The endpoint paginates via limit/offset and enforces its own max page size, so a page can
// come back shorter than PAGE_LIMIT even when more results remain — only an empty page means
// we've reached the end. Advance offset by what actually came back, not by PAGE_LIMIT.
const PAGE_LIMIT = 100

/**
 * Fetches the full flag catalog for discovery from Datadog's Feature Flags API
 * (GET /api/v2/feature-flags).
 *
 * Auth is DD-API-KEY / DD-APPLICATION-KEY, passed in from chrome.storage.local (via
 * useFlagCatalog) — never hardcoded here. This is a temporary stand-in for OAuth
 * (RFC Decision 4, FFL-2596): fine for individual local testing, but org API/app keys are too
 * broadly scoped to ask a wide user base to paste into a browser extension long-term.
 */
export async function fetchFlagCatalog(creds: CatalogCredentials): Promise<CatalogFlag[]> {
  if (!creds.apiKey || !creds.appKey) {
    throw new Error('Missing API credentials')
  }

  const resources: RawFeatureFlagResource[] = []
  let offset = 0

  for (;;) {
    const url = new URL(`https://api.${creds.site}/api/v2/feature-flags`)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    url.searchParams.set('offset', String(offset))

    const response = await fetch(url.toString(), {
      headers: {
        'DD-API-KEY': creds.apiKey,
        'DD-APPLICATION-KEY': creds.appKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch flag catalog: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as RawFeatureFlagsResponse
    resources.push(...body.data)

    if (body.data.length === 0) {
      break
    }
    offset += body.data.length
  }

  return mapResources(resources)
}

function mapResources(resources: RawFeatureFlagResource[]): CatalogFlag[] {
  return resources.map((resource) => ({
    key: resource.attributes.key,
    name: resource.attributes.name || resource.attributes.key,
    type: resource.attributes.value_type,
    variants: (resource.attributes.variants ?? []).map((variant) => ({
      name: variant.name,
      value: parseVariantValue(resource.attributes.value_type, variant.value),
    })),
    tags: resource.attributes.tags ?? [],
    createdBy: resource.attributes.created_by ?? null,
  }))
}

/**
 * Fetches the full flag catalog using an OAuth access token, via the FFE UI endpoint
 * (GET /api/ui/ffe/feature-flags) — the OAuth-capable equivalent of the public /api/v2 route.
 * This is the primary path (see oauth.ts); the API/App-key variant above is the fallback.
 */
export async function fetchFlagCatalogWithToken(token: string, site: string): Promise<CatalogFlag[]> {
  const host = getFlagsApiHost(site)
  const resources: RawFeatureFlagResource[] = []
  let offset = 0

  for (;;) {
    const url = new URL(`https://${host}/api/ui/ffe/feature-flags`)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    url.searchParams.set('offset', String(offset))

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch flag catalog: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as RawFeatureFlagsResponse
    resources.push(...body.data)

    if (body.data.length === 0) {
      break
    }
    offset += body.data.length
  }

  return mapResources(resources)
}
