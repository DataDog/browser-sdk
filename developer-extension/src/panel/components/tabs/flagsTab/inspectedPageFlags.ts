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
 * Per-site stores. The wrapper only reads OVERRIDES_KEY, so we keep that as a copy of the connected
 * site's store and leave the other sites here, where the wrapper can't see them. The trailing dot
 * stops these keys matching OVERRIDES_KEY itself.
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

// Shared by every eval so all paths read storage the same way. `stable` ignores key order, so two
// equal maps compare equal.
const EVAL_HELPERS = `
  const parse = (raw) => {
    try {
      const parsed = JSON.parse(raw || 'null')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch (e) {
      return null
    }
  }
  const stable = (map) => JSON.stringify(Object.keys(map).sort().map((k) => [k, map[k]]))
`

// Leaves a mutable `overrides` in scope for the read and write paths.
function overridesPrelude(storeKey: string): string {
  return `
  ${EVAL_HELPERS}
  let overrides = parse(localStorage.getItem(${JSON.stringify(storeKey)})) || {}
`
}

/**
 * Reads the current overrides and enablement marker straight from the inspected page's localStorage
 * — the page is the single source of truth, never cached elsewhere.
 *
 * Returns null on a transient eval failure (the page navigating or busy) rather than an empty state,
 * so the caller keeps its last good values instead of blanking the overrides and flashing the
 * "not detected" warning.
 */
export async function readFlagState(site?: string): Promise<FlagState | null> {
  // Signed out we can't tell what the page is applying: a site switch repoints the projection before
  // the reload that picks it up, so the page can still be running the site it loaded with. Report
  // everything stored instead — which is also exactly what Clear all wipes there.
  const source = site
    ? overridesPrelude(siteOverridesKey(site))
    : `
      ${overridesPrelude(OVERRIDES_KEY)}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.indexOf(${JSON.stringify(SITE_OVERRIDES_PREFIX)}) === 0) {
          const store = parse(localStorage.getItem(key)) || {}
          for (const flagKey of Object.keys(store)) {
            if (!Object.prototype.hasOwnProperty.call(overrides, flagKey)) {
              overrides[flagKey] = store[flagKey]
            }
          }
        }
      }
    `
  try {
    const raw = (await evalInWindow(`
      ${source}
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
 * Copies `site`'s store into the key the wrapper reads, so only that site's overrides apply.
 * `changed` is false when it already matched, so callers don't ask for a needless reload.
 *
 * The store is the only source: anything written straight to OVERRIDES_KEY is overwritten, including
 * overrides left by builds that predate per-site scoping. Those are dropped on first connect rather
 * than migrated — the tab is days old, so there's nothing worth carrying forward.
 *
 * Null means the write failed — callers must surface that, since the page then keeps applying
 * whichever site's overrides it already had.
 */
export async function syncSiteOverrides(site: string): Promise<{ changed: boolean } | null> {
  const storeKey = siteOverridesKey(site)
  try {
    return (await evalInWindow(`
      ${EVAL_HELPERS}
      const projection = parse(localStorage.getItem(${JSON.stringify(OVERRIDES_KEY)})) || {}
      const siteOverrides = parse(localStorage.getItem(${JSON.stringify(storeKey)})) || {}
      const changed = stable(projection) !== stable(siteOverrides)
      if (changed) {
        localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, JSON.stringify(siteOverrides))
      }
      return { changed }
    `)) as { changed: boolean }
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
    ${overridesPrelude(storeKey)}
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
 * Connected, clears the current site only. Signed out, clears every site — leaving the other stores
 * would bring their overrides back on reconnect, as if the button hadn't worked.
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
