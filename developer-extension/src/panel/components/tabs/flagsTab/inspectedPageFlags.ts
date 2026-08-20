import { createLogger } from '../../../../common/logger'
import { evalInWindow } from '../../../evalInWindow'
import type { FlagType } from './flagTypes'

const logger = createLogger('inspectedPageFlags')

// Contract shared with @datadog/openfeature-browser's DatadogDevtools wrapper. Keep these in sync
// with that package: the wrapper reads OVERRIDES_KEY once on initialize() and writes
// DEVTOOLS_MARKER_KEY when it is composed into the provider stack.
export const OVERRIDES_KEY = 'dd.dd_flag.overrides'
export const DEVTOOLS_MARKER_KEY = 'dd.dd_flag.devtools'

/**
 * Per-site stores, owned by this extension alone. The wrapper knows nothing about them: it only ever
 * reads OVERRIDES_KEY, which we keep as a projection of the connected site's store. That's what
 * stops an override made on staging from applying on US1 — the other site's copy is parked here
 * rather than sitting in the key the wrapper reads.
 *
 * The trailing dot matters: it keeps these keys from colliding with OVERRIDES_KEY itself when we
 * enumerate them.
 */
const SITE_OVERRIDES_PREFIX = `${OVERRIDES_KEY}.`

export function siteOverridesKey(site: string): string {
  return SITE_OVERRIDES_PREFIX + site
}

export interface FlagOverride {
  type: FlagType
  /**
   * Any JSON value — objects/arrays are `object`, and `null` is allowed (a variant value can be
   * null). The manual-entry form still rejects null via validateOverrideValue.
   */
  value: boolean | string | number | object | null
}

export type FlagOverrides = Record<string, FlagOverride>

export interface FlagState {
  overrides: FlagOverrides
  devtoolsEnabled: boolean
}

/**
 * Looks up an override by own-property membership — a plain `overrides[key]` would return inherited
 * members (e.g. Object.prototype.constructor) for flags named "constructor" or "toString", making
 * them wrongly appear overridden.
 */
export function getOverride(overrides: FlagOverrides, key: string): FlagOverride | undefined {
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined
}

function isFlagOverride(value: unknown): value is FlagOverride {
  return typeof value === 'object' && value !== null && 'type' in value && 'value' in value
}

/**
 * Drops entries that aren't FlagOverride-shaped. The page's localStorage isn't exclusively ours — a
 * hand-edited value or a different wrapper version could leave something that would crash the panel
 * on render. A wrong-typed-but-shaped entry is kept so it stays visible and removable (the provider
 * rejects it anyway).
 */
export function sanitizeOverrides(overrides: Record<string, unknown>): FlagOverrides {
  const sanitized: FlagOverrides = {}
  for (const [key, entry] of Object.entries(overrides)) {
    if (isFlagOverride(entry)) {
      sanitized[key] = entry
    }
  }
  return sanitized
}

// Shared prelude for every inspected-window eval: parses an overrides map out of localStorage,
// tolerating malformed/absent/mistyped storage, and leaves a normalized `overrides` in scope.
// Defined once so the read and mutation paths can't interpret storage differently as the contract
// evolves. `storeKey` is the site's store when connected, and OVERRIDES_KEY when signed out.
function readOverridesPrelude(storeKey: string): string {
  return `
  let overrides = {}
  try {
    const parsed = JSON.parse(localStorage.getItem(${JSON.stringify(storeKey)}) || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      overrides = parsed
    }
  } catch (e) {}
`
}

/** Key order can differ between two equal maps, so compare entries rather than raw JSON. */
const STABLE_STRINGIFY = `
  const stable = (map) => JSON.stringify(Object.keys(map).sort().map((k) => [k, map[k]]))
`

/**
 * Reads the current overrides and enablement marker straight from the inspected page's localStorage
 * — the page is the single source of truth, never cached elsewhere.
 *
 * Returns null on a transient eval failure (the page navigating or busy) rather than an empty state,
 * so the caller keeps its last good values instead of blanking the overrides and flashing the
 * "not detected" warning.
 */
export async function readFlagState(site?: string): Promise<FlagState | null> {
  // Connected, so show that site's own overrides. Signed out there's no site to scope by, and what
  // matters is what the page is actually applying — which is the projection.
  const storeKey = site ? siteOverridesKey(site) : OVERRIDES_KEY
  try {
    const raw = (await evalInWindow(`
      ${readOverridesPrelude(storeKey)}
      const devtoolsEnabled = localStorage.getItem(${JSON.stringify(DEVTOOLS_MARKER_KEY)}) === 'enabled'
      return { overrides, devtoolsEnabled }
    `)) as FlagState
    return { overrides: sanitizeOverrides(raw.overrides ?? {}), devtoolsEnabled: !!raw.devtoolsEnabled }
  } catch (error) {
    logger.error('Error while reading flag overrides:', error)
    return null
  }
}

/**
 * Points the key the wrapper reads at `site`'s store, so only that site's overrides apply. Returns
 * that store, plus whether the projection actually changed: if it didn't, the page is already
 * running the right values and must not be asked to reload — that's what keeps signing in inert.
 *
 * Also adopts pre-scoping overrides, but only while no site store holds anything. Adopting per-site
 * would copy whatever is live into each site as you visit it, which is the leak this exists to stop.
 * Once a store does hold something the extension owns the projection, and anything written straight
 * to OVERRIDES_KEY from outside is overwritten on the next sync.
 *
 * Returns null if the page couldn't be written to. The caller must surface that rather than assume
 * success — an unprojected page keeps applying whichever site it had.
 */
export async function syncSiteOverrides(site: string): Promise<{ changed: boolean; overrides: FlagOverrides } | null> {
  const storeKey = siteOverridesKey(site)
  try {
    const result = (await evalInWindow(`
      ${STABLE_STRINGIFY}
      const parse = (raw) => {
        try {
          const parsed = JSON.parse(raw || 'null')
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
        } catch (e) {
          return null
        }
      }

      const projection = parse(localStorage.getItem(${JSON.stringify(OVERRIDES_KEY)})) || {}
      let siteOverrides = parse(localStorage.getItem(${JSON.stringify(storeKey)}))

      if (siteOverrides === null) {
        let anySiteOverrides = false
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.indexOf(${JSON.stringify(SITE_OVERRIDES_PREFIX)}) === 0) {
            const store = parse(localStorage.getItem(key))
            if (store && Object.keys(store).length > 0) {
              anySiteOverrides = true
              break
            }
          }
        }
        siteOverrides = anySiteOverrides ? {} : projection
        // Only persist a store with something in it. Writing an empty one on a clean page would
        // disarm adoption for this origin forever, so a later hand-written override would be wiped.
        if (Object.keys(siteOverrides).length > 0) {
          localStorage.setItem(${JSON.stringify(storeKey)}, JSON.stringify(siteOverrides))
        }
      }

      const changed = stable(projection) !== stable(siteOverrides)
      if (changed) {
        localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, JSON.stringify(siteOverrides))
      }
      return { changed, overrides: siteOverrides }
    `)) as { changed: boolean; overrides: Record<string, unknown> }
    return { changed: result.changed, overrides: sanitizeOverrides(result.overrides ?? {}) }
  } catch (error) {
    logger.error('Error while scoping flag overrides to the site:', error)
    return null
  }
}

/**
 * Reads, mutates, and writes back the overrides map in a single round trip, returning the resulting
 * map so the caller needs no follow-up read. Kept as one eval because splitting it would let a page
 * navigation land between read and write, applying the previous origin's overrides to the new one.
 */
async function applyOverrideStatement(statement: string, site?: string): Promise<Record<string, unknown>> {
  const storeKey = site ? siteOverridesKey(site) : OVERRIDES_KEY
  return (await evalInWindow(`
    ${readOverridesPrelude(storeKey)}
    ${statement}
    const serialized = JSON.stringify(overrides)
    localStorage.setItem(${JSON.stringify(storeKey)}, serialized)
    ${site ? `localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, serialized)` : ''}
    return overrides
  `)) as Record<string, unknown>
}

export function writeOverride(key: string, override: FlagOverride, site?: string): Promise<Record<string, unknown>> {
  // Parse the override from JSON *data* rather than interpolating an object literal, so a value
  // property named "__proto__" stays real data instead of the prototype setter (which would silently
  // drop it and persist {}).
  const overrideJson = JSON.stringify(JSON.stringify(override))
  return applyOverrideStatement(`overrides[${JSON.stringify(key)}] = JSON.parse(${overrideJson})`, site)
}

export function deleteOverride(key: string, site?: string): Promise<Record<string, unknown>> {
  return applyOverrideStatement(`delete overrides[${JSON.stringify(key)}]`, site)
}

/**
 * Connected, this clears the site you're on and leaves the other sites' stores alone. Signed out
 * there's no site to scope to, so it wipes every store as well as the projection — clearing only the
 * projection would let the overrides reappear the moment you reconnect, which reads as the button
 * not having worked.
 */
export async function clearAllOverrides(site?: string): Promise<Record<string, unknown>> {
  if (site) {
    return applyOverrideStatement('overrides = {}', site)
  }
  await evalInWindow(`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.indexOf(${JSON.stringify(SITE_OVERRIDES_PREFIX)}) === 0) {
        localStorage.removeItem(key)
      }
    }
    localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, '{}')
  `)
  return {}
}

/**
 * Reloads the inspected page so the wrapper re-reads localStorage. Overrides are written
 * immediately; this is only how they take effect.
 */
export function reloadInspectedPage(): void {
  chrome.devtools.inspectedWindow.reload({})
}
