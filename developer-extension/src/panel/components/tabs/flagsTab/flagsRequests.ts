import { fetchFfeJson } from './ffeApi'
import { FLAG_TYPES, parseTypedString, type FlagType } from './flagTypes'
import { getFlagsApiHost } from './oauth'

export interface CatalogFlag {
  key: string
  name: string
  /** Free-text description authored in the Datadog UI. Empty when the flag has none. */
  description: string
  type: FlagType
  /** Parsed value of each variant (any JSON value); see parseVariantValue. */
  variants: Array<{ name: string; value: unknown }>
  tags: string[]
  /**
   * UUID of the user who created the flag. Undefined for flags created by a service account or
   * integration. Compared against the signed-in user's UUID for the "My feature flags" filter.
   */
  createdBy?: string
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
  /** Team handles for the "My teams" filter, sent as `tags=team:<handle>`. */
  teamFilter: string[]
  /** The signed-in user's UUID when "My feature flags" is on, else null. Sent as `created_by`. */
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

/**
 * Fetches a specific set of flags by exact key, one request per key (the endpoint's `key` filter is
 * exact and single-valued — there's no batched lookup). Used for the "Local overrides" section,
 * which must show overridden flags even when they're not on the current catalog page.
 *
 * Settles per key rather than Promise.all: one key failing transiently must not discard the flags
 * that did resolve, or the whole section collapses to bare fallback rows. Keys with no match
 * (deleted, or an override for a non-existent flag) are simply absent, and the caller falls back to
 * a minimal row. Error labels omit the key — it's customer data, kept out of logs.
 */
export async function fetchFlagsByKeys(token: string, site: string, keys: string[]): Promise<CatalogFlag[]> {
  const host = getFlagsApiHost(site)
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

/**
 * Shared request/response handling for both fetch functions: run the request, tolerate a response
 * that omits or mistypes `data`, and map its resources. `total` falls back to the resource count
 * when the server omits `meta.page.total` (a partial response, or the by-key lookup which sends no
 * pagination fields).
 */
async function fetchFlagPage(url: URL, token: string, errorLabel: string): Promise<FlagCatalogPage> {
  const body = await fetchFfeJson<RawFeatureFlagsResponse>(url.toString(), token, errorLabel)
  const resources = Array.isArray(body?.data) ? body.data : []
  return {
    flags: mapResources(resources),
    total: body?.meta?.page?.total ?? resources.length,
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
