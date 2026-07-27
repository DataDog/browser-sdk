import type { FlagType } from './flagTypeConstants'
import { getFlagsApiHost } from './oauth'

export interface CatalogFlag {
  key: string
  name: string
  type: FlagType
  // Parsed value of each variant (any JSON value); see parseVariantValue.
  variants: Array<{ name: string; value: unknown }>
  tags: string[]
}

// Filters + pagination sent to the server so the FFE endpoint does the work — the extension never
// loads the whole catalog. The endpoint applies all of these itself: `search` matches name/key/tags,
// `tags` are AND-ed, `value_type` is OR-ed (see dd-source ffe-service). `page` is 1-based.
export interface FlagCatalogRequest {
  page: number
  pageSize: number
  search: string
  typeFilter: string[]
  tagFilter: string[]
}

// One page of results plus the server's total count (for pagination).
export interface FlagCatalogPage {
  flags: CatalogFlag[]
  total: number
}

interface RawFeatureFlag {
  attributes: {
    key: string
    name?: string
    value_type: FlagType
    variants?: Array<{ name: string; value: string }>
    tags?: string[]
  }
}

interface RawFeatureFlagsResponse {
  data?: RawFeatureFlag[]
  meta?: { page?: { total?: number } }
}

// Variant values come back from the API as strings regardless of the flag's declared type. Falls
// back to the raw string on unparseable input so one malformed variant can't blow up the mapping
// of the entire catalog.
function parseVariantValue(type: FlagType, rawValue: string): unknown {
  switch (type) {
    case 'BOOLEAN':
      // Only the exact strings count; anything else (e.g. "True", "falsex", "") is malformed and
      // kept raw rather than silently collapsing to false.
      if (rawValue === 'true') {
        return true
      }
      if (rawValue === 'false') {
        return false
      }
      return rawValue
    case 'INTEGER': {
      // parseInt would accept partial/oversized input ("5abc" -> 5, unsafe integers get rounded), so
      // require the whole string to be an integer within the safe range; otherwise keep it raw.
      const parsed = Number(rawValue)
      return /^[+-]?\d+$/.test(rawValue) && Number.isSafeInteger(parsed) ? parsed : rawValue
    }
    case 'NUMERIC': {
      // parseFloat accepts a numeric prefix ("5abc" -> 5) and Number("") is 0, so require a
      // non-empty string that parses fully to a finite number; otherwise keep it raw.
      const parsed = Number(rawValue)
      return rawValue.trim() !== '' && Number.isFinite(parsed) ? parsed : rawValue
    }
    case 'JSON':
      try {
        return JSON.parse(rawValue) as unknown
      } catch {
        return rawValue
      }
    case 'STRING':
      return rawValue
    default:
      // The server returned a value_type outside the known union (which is a compile-time
      // assumption, not a runtime guarantee) — keep the raw string rather than returning undefined,
      // consistent with never letting one odd variant blow up the mapping.
      return rawValue
  }
}

/**
 * Fetches ONE page of the flag catalog via the FFE UI endpoint (GET /api/ui/ffe/feature-flags),
 * letting the server apply the filters + pagination. Returns the page's flags plus the server's
 * total match count (`meta.page.total`) so the caller can render pagination. OAuth is the only
 * supported auth path (see oauth.ts).
 */
export async function fetchFlagCatalog(
  token: string,
  site: string,
  request: FlagCatalogRequest
): Promise<FlagCatalogPage> {
  const url = new URL(`https://${getFlagsApiHost(site)}/api/ui/ffe/feature-flags`)
  url.searchParams.set('page[limit]', String(request.pageSize))
  url.searchParams.set('page[offset]', String((request.page - 1) * request.pageSize))
  // Active flags only: with archived included, an archived and an active flag can share a key and
  // land on the same page, which would render as duplicate rows and collide React keys.
  url.searchParams.set('is_archived', 'false')
  if (request.search) {
    url.searchParams.set('search', request.search)
  }
  for (const type of request.typeFilter) {
    url.searchParams.append('value_type', type)
  }
  for (const tag of request.tagFilter) {
    url.searchParams.append('tags', tag)
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch flag catalog: ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as RawFeatureFlagsResponse
  // Tolerate a response that omits/mistypes `data` rather than throwing on `.map`.
  const resources = Array.isArray(body?.data) ? body.data : []
  return {
    flags: mapResources(resources),
    // Fall back to the page length when the server omits the total (e.g. a partial/legacy response).
    total: body?.meta?.page?.total ?? resources.length,
  }
}

function mapResources(resources: RawFeatureFlag[]): CatalogFlag[] {
  // Dedupe by key as a cheap safety net against a flag appearing twice on a page (see is_archived
  // note above); collisions would otherwise break React keys (`key={flag.key}`). Keep the first.
  const byKey = new Map<string, CatalogFlag>()
  for (const { attributes } of resources) {
    if (byKey.has(attributes.key)) {
      continue
    }
    byKey.set(attributes.key, {
      key: attributes.key,
      name: attributes.name || attributes.key,
      type: attributes.value_type,
      variants: (attributes.variants ?? []).map((variant) => ({
        name: variant.name,
        value: parseVariantValue(attributes.value_type, variant.value),
      })),
      tags: attributes.tags ?? [],
    })
  }
  return Array.from(byKey.values())
}
