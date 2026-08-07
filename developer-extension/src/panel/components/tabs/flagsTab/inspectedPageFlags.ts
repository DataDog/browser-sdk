import { createLogger } from '../../../../common/logger'
import { evalInWindow } from '../../../evalInWindow'
import type { FlagType } from './flagTypes'

const logger = createLogger('inspectedPageFlags')

// Contract shared with @datadog/openfeature-browser's DatadogDevtools wrapper.
// Keep these in sync with that package: the wrapper reads OVERRIDES_KEY once on
// initialize() and writes DEVTOOLS_MARKER_KEY when it is composed into the provider stack.
export const OVERRIDES_KEY = 'dd.dd_flag.overrides'
export const DEVTOOLS_MARKER_KEY = 'dd.dd_flag.devtools'

export interface FlagOverride {
  type: FlagType
  // Any JSON value — objects/arrays are `object`; `null` is allowed (a flag/variant value can be
  // null). The manual-entry form still rejects null via validateOverrideValue.
  value: boolean | string | number | object | null
}

export type FlagOverrides = Record<string, FlagOverride>

export interface FlagState {
  overrides: FlagOverrides
  devtoolsEnabled: boolean
}

/**
 * Look up an override by key using own-property membership — a plain `overrides[key]` would
 * return inherited members (e.g. Object.prototype.constructor) for flags named "constructor",
 * "toString", etc., making them wrongly appear overridden.
 */
export function getOverride(overrides: FlagOverrides, key: string): FlagOverride | undefined {
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined
}

// The page's localStorage isn't exclusively ours to write — a hand-edited value, or a different
// version of the DatadogDevtools wrapper, could leave an entry that isn't a FlagOverride shape
// (e.g. `null`). Drop those rather than let `override.value` crash the panel when rendered. A
// wrong-typed-but-shaped entry is kept so it stays visible and removable (the provider rejects it).
function isFlagOverride(value: unknown): value is FlagOverride {
  return typeof value === 'object' && value !== null && 'type' in value && 'value' in value
}

export function sanitizeOverrides(overrides: Record<string, unknown>): FlagOverrides {
  const sanitized: FlagOverrides = {}
  for (const [key, entry] of Object.entries(overrides)) {
    if (isFlagOverride(entry)) {
      sanitized[key] = entry
    }
  }
  return sanitized
}

// Shared read/normalize prelude for every inspected-window eval: parse the overrides map from
// localStorage and tolerate malformed/absent/mistyped storage, leaving a normalized `overrides`
// object in scope. Defined once so the read and mutation paths can't interpret storage differently
// as the DatadogDevtools contract evolves.
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
 * Reads the current overrides and enablement marker straight from the inspected page's
 * localStorage. The page is the single source of truth — we never cache it elsewhere.
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
    // A transient eval failure (the inspected page navigating/reloading, or busy) is NOT the same as
    // "no overrides and no wrapper". Return null so the caller keeps its last good state rather than
    // blanking the overrides and flashing the "not detected" warning.
    logger.error('Error while reading flag overrides:', error)
    return null
  }
}

// Reads, mutates, and writes back the overrides map in a single inspected-window round trip, then
// returns the resulting map so the caller can update its state without a second read. Splitting this
// into a separate read then write would let a page navigation land between the two, applying the
// previous origin's overrides on top of the new origin's storage.
async function applyOverrideStatement(statement: string): Promise<Record<string, unknown>> {
  return (await evalInWindow(`
    ${READ_OVERRIDES_PRELUDE}
    ${statement}
    localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, JSON.stringify(overrides))
    return overrides
  `)) as Record<string, unknown>
}

export function writeOverride(key: string, override: FlagOverride): Promise<Record<string, unknown>> {
  // Parse the override from JSON *data* rather than interpolating it as an object literal, so a value
  // property named "__proto__" stays real data instead of the object-literal prototype setter (which
  // would silently drop it and persist {}).
  const overrideJson = JSON.stringify(JSON.stringify(override))
  return applyOverrideStatement(`overrides[${JSON.stringify(key)}] = JSON.parse(${overrideJson})`)
}

export function deleteOverride(key: string): Promise<Record<string, unknown>> {
  return applyOverrideStatement(`delete overrides[${JSON.stringify(key)}]`)
}

export function clearAllOverrides(): Promise<Record<string, unknown>> {
  return applyOverrideStatement('overrides = {}')
}

// Reloads the inspected page so the DatadogDevtools wrapper re-reads localStorage and (re)applies the
// current overrides. Overrides are written immediately; this is only how they take effect.
export function reloadInspectedPage(): void {
  chrome.devtools.inspectedWindow.reload({})
}
