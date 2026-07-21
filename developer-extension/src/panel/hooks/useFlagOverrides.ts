import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '../../common/logger'
import { evalInWindow } from '../evalInWindow'

const logger = createLogger('useFlagOverrides')

// Contract shared with @datadog/openfeature-browser's DatadogDevtools wrapper.
// Keep these in sync with that package: the wrapper reads OVERRIDES_KEY once on
// initialize() and writes DEVTOOLS_MARKER_KEY when it is composed into the provider stack.
export const OVERRIDES_KEY = 'dd.dd_flag.overrides'
export const DEVTOOLS_MARKER_KEY = 'dd.dd_flag.devtools'

const REFRESH_INTERVAL = 2000

export type FlagOverrideType = 'BOOLEAN' | 'STRING' | 'INTEGER' | 'NUMERIC' | 'JSON'

export interface FlagOverride {
  type: FlagOverrideType
  value: boolean | string | number | object
}

export type FlagOverrides = Record<string, FlagOverride>

export interface FlagState {
  overrides: FlagOverrides
  devtoolsEnabled: boolean
}

// Mirror of the type rules enforced by the DatadogDevtools wrapper, so the UI can reject
// invalid overrides before writing them (the wrapper would otherwise throw at resolve time).
const EXPECTED_JS_TYPES: Record<FlagOverrideType, string> = {
  BOOLEAN: 'boolean',
  STRING: 'string',
  INTEGER: 'number',
  NUMERIC: 'number',
  JSON: 'object',
}

/**
 * Returns an error message if the value doesn't match the declared type, or null if valid.
 */
export function validateOverrideValue(type: FlagOverrideType, value: unknown): string | null {
  if (value === null) {
    return 'Value cannot be null'
  }
  if (typeof value !== EXPECTED_JS_TYPES[type]) {
    return `Value must be a ${EXPECTED_JS_TYPES[type]} for type ${type}`
  }
  if (type === 'INTEGER' && !Number.isInteger(value)) {
    return 'INTEGER value must be a whole number'
  }
  return null
}

/**
 * Reads the current overrides and enablement marker straight from the inspected page's
 * localStorage. The page is the single source of truth — we never cache it elsewhere.
 */
export async function readFlagState(): Promise<FlagState> {
  try {
    const raw = (await evalInWindow(`
      let overrides = {}
      try {
        const parsed = JSON.parse(localStorage.getItem(${JSON.stringify(OVERRIDES_KEY)}) || '{}')
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          overrides = parsed
        }
      } catch (e) {}
      const devtoolsEnabled = localStorage.getItem(${JSON.stringify(DEVTOOLS_MARKER_KEY)}) === 'enabled'
      return { overrides, devtoolsEnabled }
    `)) as FlagState
    return { overrides: raw.overrides ?? {}, devtoolsEnabled: !!raw.devtoolsEnabled }
  } catch (error) {
    logger.error('Error while reading flag overrides:', error)
    return { overrides: {}, devtoolsEnabled: false }
  }
}

/**
 * Writes the full overrides map to the inspected page's localStorage. Takes effect on the
 * next page reload, since the wrapper reads overrides once on initialize().
 */
export async function writeOverrides(overrides: FlagOverrides): Promise<void> {
  await evalInWindow(`
    localStorage.setItem(${JSON.stringify(OVERRIDES_KEY)}, ${JSON.stringify(JSON.stringify(overrides))})
  `)
}

export function useFlagOverrides() {
  const [state, setState] = useState<FlagState>({ overrides: {}, devtoolsEnabled: false })

  const refresh = useCallback(() => {
    void readFlagState().then((next) => setState((prev) => (deepEqual(prev, next) ? prev : next)))
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  // Read-modify-write against a fresh read so concurrent edits (or console tweaks) aren't clobbered.
  const setOverride = useCallback(
    async (flagKey: string, override: FlagOverride) => {
      const { overrides } = await readFlagState()
      await writeOverrides({ ...overrides, [flagKey]: override })
      refresh()
    },
    [refresh]
  )

  const clearOverride = useCallback(
    async (flagKey: string) => {
      const { overrides } = await readFlagState()
      const next = { ...overrides }
      delete next[flagKey]
      await writeOverrides(next)
      refresh()
    },
    [refresh]
  )

  const clearAll = useCallback(async () => {
    await writeOverrides({})
    refresh()
  }, [refresh])

  const reloadPage = useCallback(() => {
    chrome.devtools.inspectedWindow.reload({})
  }, [])

  return {
    overrides: state.overrides,
    devtoolsEnabled: state.devtoolsEnabled,
    setOverride,
    clearOverride,
    clearAll,
    reloadPage,
    refresh,
  }
}

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}
