import { fetchFfeJson } from './ffeApi'
import { FLAG_TYPES, parseTypedString, type FlagType } from './flagTypes'
import { getFlagsApiHost } from './oauth'

export interface CatalogFlag {
  key: string
  name: string
  description: string
  type: FlagType
  /** Parsed value of each variant (any JSON value); see parseVariantValue. */
  variants: Array<{ name: string; value: unknown }>
  tags: string[]
  /** Undefined for flags created by a service account or integration, which carry no user UUID. */
  createdBy?: string
  /** Synthesized locally, never from the API: no active flag on the connected site holds this key. */
  unresolved?: boolean
}

/**
 * Filters + pagination sent to the server so the FFE endpoint does the work — the extension never
 * loads the whole catalog. The server applies all of these itself: `search` matches name/key/tags,
 * `tags` are AND-ed, `value_type` is OR-ed, `created_by` is an IN-list, and `team:<handle>` tags are
 * OR-ed among themselves then AND-ed with regular tags (see dd-source ffe-service). `page` is 1-based.
 *
 * Filtering server-side is required, not an optimization: we load one page at a time, so a
 * client-side filter would only ever see the current page.
 */
export interface FlagCatalogRequest {
  page: number
  pageSize: number
  search: string
  typeFilter: string[]
  tagFilter: string[]
  teamFilter: string[]
  createdBy: string | null
}

/** One page of results plus the server's total count (for pagination). */
export interface FlagCatalogPage {
  flags: CatalogFlag[]
  total: number
}

interface RawFeatureFlag {
  attributes: {
    key: string
    name?: string
    description?: string
    value_type: FlagType
    variants?: Array<{ name: string; value: string }>
    tags?: string[]
    created_by?: string
  }
}

interface RawFeatureFlagsResponse {
  data?: RawFeatureFlag[]
  meta?: { page?: { total?: number } }
}

/**
 * Variant values come back as strings regardless of the flag's declared type. Tolerant by design:
 * anything unparseable is kept as its raw string so one malformed variant can't blow up the mapping
 * of the entire catalog. That includes an unknown `value_type` (a compile-time assumption, not a
 * runtime guarantee), which must not reach parseTypedString — its switch has no default.
 */
function parseVariantValue(type: FlagType, rawValue: string): unknown {
  if (type === 'BOOLEAN') {
    // Only the exact strings count; anything else ("True", "falsex", "") is malformed and kept raw
    // rather than silently collapsing to false.
    if (rawValue === 'true') {
      return true
    }
    if (rawValue === 'false') {
      return false
    }
    return rawValue
  }
  if (!FLAG_TYPES.includes(type)) {
    return rawValue
  }
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
  // Active only: an archived and an active flag can share a key and land on the same page, which
  // would render as duplicate rows and collide React keys.
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
  for (const handle of request.teamFilter) {
    url.searchParams.append('tags', `team:${handle}`)
  }
  if (request.createdBy) {
    url.searchParams.set('created_by', request.createdBy)
  }

  return fetchFlagPage(url, token, 'Failed to fetch flag catalog')
}

export interface FlagsByKeysResult {
  flags: CatalogFlag[]
  /** Keys whose lookup completed and matched nothing; a failed lookup is not in here. */
  missingKeys: string[]
}

/**
 * Fetches a specific set of flags by exact key, one request per key (the endpoint's `key` filter is
 * exact and single-valued — there's no batched lookup). Used for the "Local overrides" section,
 * which must show overridden flags even when they're not on the current catalog page.
 *
 * Settles per key rather than Promise.all: one key failing transiently must not discard the flags
 * that did resolve, or the whole section collapses to bare fallback rows. Only a well-formed
 * response that matched nothing counts as `missingKeys` — a failed request, or a 2xx whose body
 * isn't the expected envelope, proves nothing. Error labels omit the key — it's customer data.
 *
 * Active-only for the same reason as the catalog: an archived and an active flag can share a key,
 * and mapResources keeps whichever the server listed first, so including archived ones would risk
 * describing the override against the wrong flag's type and variants. An override on a flag archived
 * here therefore reads as absent, which the row reports as archived or deleted.
 */
export async function fetchFlagsByKeys(token: string, site: string, keys: string[]): Promise<FlagsByKeysResult> {
  const host = getFlagsApiHost(site)
  const results = await Promise.allSettled(
    keys.map((key) => {
      const url = new URL(`https://${host}/api/ui/ffe/feature-flags`)
      url.searchParams.set('key', key)
      url.searchParams.set('is_archived', 'false')
      return fetchFlagPage(url, token, 'Failed to fetch flag')
    })
  )
  const flags = results.flatMap((result) => (result.status === 'fulfilled' ? result.value.flags : []))
  const foundKeys = new Set(flags.map((flag) => flag.key))
  const missingKeys = keys.filter(
    (key, index) => results[index].status === 'fulfilled' && results[index].value.wellFormed && !foundKeys.has(key)
  )
  return { flags, missingKeys }
}

/**
 * Shared request/response handling for both fetch functions: run the request, tolerate a response
 * that omits or mistypes `data`, and map its resources. `total` falls back to the resource count
 * when the server omits `meta.page.total` (a partial response, or the by-key lookup which sends no
 * pagination fields). `wellFormed` reports whether `data` was actually there, so a caller reading
 * meaning into an empty result can tell a real no-match from a body we merely tolerated.
 */
async function fetchFlagPage(
  url: URL,
  token: string,
  errorLabel: string
): Promise<FlagCatalogPage & { wellFormed: boolean }> {
  const body = await fetchFfeJson<RawFeatureFlagsResponse>(url.toString(), token, errorLabel)
  const data = body?.data
  const wellFormed = Array.isArray(data)
  const resources = wellFormed ? data : []
  return {
    flags: mapResources(resources),
    total: body?.meta?.page?.total ?? resources.length,
    wellFormed,
  }
}

/** Maps raw resources to CatalogFlag, deduping by key (collisions would break React keys). */
function mapResources(resources: RawFeatureFlag[]): CatalogFlag[] {
  const byKey = new Map<string, CatalogFlag>()
  for (const { attributes } of resources) {
    if (byKey.has(attributes.key)) {
      continue
    }
    byKey.set(attributes.key, {
      key: attributes.key,
      name: attributes.name || attributes.key,
      description: attributes.description ?? '',
      type: attributes.value_type,
      variants: (attributes.variants ?? []).map((variant) => ({
        name: variant.name,
        value: parseVariantValue(attributes.value_type, variant.value),
      })),
      tags: attributes.tags ?? [],
      createdBy: attributes.created_by,
    })
  }
  return Array.from(byKey.values())
}
