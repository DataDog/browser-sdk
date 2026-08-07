import { FLAG_TYPES, parseTypedString, type FlagType } from './flagTypes'
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
  if (type === 'BOOLEAN') {
    // Only the exact strings count; anything else (e.g. "True", "falsex", "") is malformed and
    // kept raw rather than silently collapsing to false.
    if (rawValue === 'true') {
      return true
    }
    if (rawValue === 'false') {
      return false
    }
    return rawValue
  }
  if (!FLAG_TYPES.includes(type)) {
    // The server returned a value_type outside the known union (which is a compile-time
    // assumption, not a runtime guarantee) — keep the raw string rather than passing it to
    // parseTypedString (whose switch has no default and would return undefined), consistent with
    // never letting one odd variant blow up the mapping.
    return rawValue
  }
  // The catalog is tolerant: a variant that doesn't parse is kept as its raw string.
  const result = parseTypedString(type, rawValue)
  return result.ok ? result.value : rawValue
}

/**
 * Fetches ONE page of the flag catalog via the FFE UI endpoint (GET /api/ui/ffe/feature-flags),
 * letting the server apply the filters + pagination. Returns the page's flags plus the server's
 * total match count (`meta.page.total`) so the caller can render pagination. OAuth is the only
 * supported auth path (see oauth.ts).
 */
export function fetchFlagCatalog(token: string, site: string, request: FlagCatalogRequest): Promise<FlagCatalogPage> {
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

  return fetchFlagPage(url, token, 'Failed to fetch flag catalog')
}

/**
 * Fetches a specific set of flags by exact key, one request per key (the endpoint's `key` filter is
 * exact and single-valued — there's no batched lookup). Used for the "Local overrides" section, which
 * must show overridden flags even when they're not on the current catalog page. Keys with no match
 * (deleted, or a hand-entered override for a non-existent flag) are simply absent from the result.
 */
export async function fetchFlagsByKeys(token: string, site: string, keys: string[]): Promise<CatalogFlag[]> {
  const host = getFlagsApiHost(site)
  // Settle per key rather than Promise.all: one key failing transiently (e.g. a rate limit) must not
  // discard the flags that did resolve — otherwise the whole "Local overrides" section collapses to
  // bare fallback rows until the key set changes. A dropped key just falls back to a minimal row in
  // the caller. (The error label omits the key regardless — it's customer data, kept out of logs.)
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const url = new URL(`https://${host}/api/ui/ffe/feature-flags`)
      url.searchParams.set('key', key)
      url.searchParams.set('is_archived', 'false')
      const { flags } = await fetchFlagPage(url, token, 'Failed to fetch flag')
      return flags
    })
  )
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

// Shared request/response handling for both fetchFlagCatalog and fetchFlagsByKeys: run the request,
// tolerate a response that omits/mistypes `data`, and map its resources into CatalogFlag[]. `total`
// falls back to the resource count when the server omits `meta.page.total` (e.g. a partial/legacy
// response, or the by-key lookup which never sends pagination fields).
async function fetchFlagPage(url: URL, token: string, errorLabel: string): Promise<FlagCatalogPage> {
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as RawFeatureFlagsResponse
  const resources = Array.isArray(body?.data) ? body.data : []
  return {
    flags: mapResources(resources),
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
