import { createLogger } from '../../../../common/logger'
import { evalInWindow } from '../../../evalInWindow'
import type { FlagType } from './flagTypes'

const logger = createLogger('inspectedPageFlags')

// Contract shared with @datadog/openfeature-browser's DatadogDevtools wrapper. Keep these in sync
// with that package: the wrapper reads OVERRIDES_KEY once on initialize() and writes
// DEVTOOLS_MARKER_KEY when it is composed into the provider stack.
export const OVERRIDES_KEY = 'dd.dd_flag.overrides'
export const DEVTOOLS_MARKER_KEY = 'dd.dd_flag.devtools'

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

// Shared prelude for every inspected-window eval: parses the overrides map from localStorage,
// tolerating malformed/absent/mistyped storage, and leaves a normalized `overrides` in scope.
// Defined once so the read and mutation paths can't interpret storage differently as the contract
// evolves.
const READ_OVERRIDES_PRELUDE = `
  let overrides = {}
  try {
    const parsed = JSON.parse(localStorage.getItem(${JSON.stringify(OVERRIDES_KEY)}) || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      overrides = parsed
    }
  } catch (e) {}
`

/**
 * Reads the current overrides and enablement marker straight from the inspected page's localStorage
 * — the page is the single source of truth, never cached elsewhere.
 *
 * Returns null on a transient eval failure (the page navigating or busy) rather than an empty state,
 * so the caller keeps its last good values instead of blanking the overrides and flashing the
 * "not detected" warning.
 */
export async function readFlagState(): Promise<FlagState | null> {
  try {
    const raw = (await evalInWindow(`
      ${READ_OVERRIDES_PRELUDE}
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
 * Reads, mutates, and writes back the overrides map in a single round trip, returning the resulting
 * map so the caller needs no follow-up read. Kept as one eval because splitting it would let a page
 * navigation land between read and write, applying the previous origin's overrides to the new one.
 */
async function applyOverrideStatement(statement: string): Promise<Record<string, unknown>> {
  return (await evalInWindow(`
    ${READ_OVERRIDES_PRELUDE}
    ${statement}
    localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, JSON.stringify(overrides))
    return overrides
  `)) as Record<string, unknown>
}

export function writeOverride(key: string, override: FlagOverride): Promise<Record<string, unknown>> {
  // Parse the override from JSON *data* rather than interpolating an object literal, so a value
  // property named "__proto__" stays real data instead of the prototype setter (which would silently
  // drop it and persist {}).
  const overrideJson = JSON.stringify(JSON.stringify(override))
  return applyOverrideStatement(`overrides[${JSON.stringify(key)}] = JSON.parse(${overrideJson})`)
}

export function deleteOverride(key: string): Promise<Record<string, unknown>> {
  return applyOverrideStatement(`delete overrides[${JSON.stringify(key)}]`)
}

export function clearAllOverrides(): Promise<Record<string, unknown>> {
  return applyOverrideStatement('overrides = {}')
}

/**
 * Reloads the inspected page so the wrapper re-reads localStorage. Overrides are written
 * immediately; this is only how they take effect.
 */
export function reloadInspectedPage(): void {
  chrome.devtools.inspectedWindow.reload({})
}
