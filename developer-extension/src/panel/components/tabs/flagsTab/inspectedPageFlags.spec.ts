import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import {
  DEVTOOLS_MARKER_KEY,
  OVERRIDES_KEY,
  clearAllOverrides,
  deleteOverride,
  readFlagState,
  siteOverridesKey,
  syncSiteOverrides,
  writeOverride,
} from './inspectedPageFlags'

const STAGING = 'datad0g.com'
const US1 = 'datadoghq.com'

function clearSiteStores() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith(`${OVERRIDES_KEY}.`)) {
      localStorage.removeItem(key)
    }
  }
}

function stored(key: string): unknown {
  return JSON.parse(localStorage.getItem(key) || 'null')
}

describe('inspectedPageFlags read/write against page localStorage', () => {
  beforeEach(() => {
    // Karma runs in a real browser, so evalInWindow's code can be evaluated directly
    // against the test page's own localStorage.
    const previousChrome = (globalThis as any).chrome
    ;(globalThis as any).chrome = {
      devtools: {
        inspectedWindow: {
          eval(code: string, callback: (result: unknown, exceptionInfo?: unknown) => void) {
            try {
              // eslint-disable-next-line no-eval
              callback(eval(code), undefined)
            } catch (error) {
              callback(undefined, { isException: true, value: String(error) })
            }
          },
        },
      },
    }
    localStorage.removeItem(OVERRIDES_KEY)
    localStorage.removeItem(DEVTOOLS_MARKER_KEY)
    clearSiteStores()
    registerCleanupTask(() => {
      ;(globalThis as any).chrome = previousChrome
      localStorage.removeItem(OVERRIDES_KEY)
      localStorage.removeItem(DEVTOOLS_MARKER_KEY)
      clearSiteStores()
    })
  })

  it('returns empty state when nothing is set', async () => {
    expect(await readFlagState()).toEqual({ overrides: {}, devtoolsEnabled: false })
  })

  it('reads overrides and the enablement marker', async () => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ 'my-flag': { type: 'BOOLEAN', value: true } }))
    localStorage.setItem(DEVTOOLS_MARKER_KEY, 'enabled')

    expect(await readFlagState()).toEqual({
      overrides: { 'my-flag': { type: 'BOOLEAN', value: true } },
      devtoolsEnabled: true,
    })
  })

  it('returns null on an eval failure so the caller keeps its last good state', async () => {
    // Suppress the expected error log so the CI unexpected-error-log reporter doesn't flag it.
    spyOn(console, 'error')
    // Simulate the inspected window rejecting the eval (e.g. mid-navigation), which must NOT read as
    // "no overrides / no wrapper".
    ;(globalThis as any).chrome.devtools.inspectedWindow.eval = (
      _code: string,
      callback: (result: unknown, exceptionInfo?: unknown) => void
    ) => callback(undefined, { isError: true, code: 'E_FAILED', description: 'inspected window busy' })

    expect(await readFlagState()).toBeNull()
  })

  it('ignores malformed override JSON', async () => {
    localStorage.setItem(OVERRIDES_KEY, 'not json')
    const state = await readFlagState()
    expect(state?.overrides).toEqual({})
  })

  it('drops stored entries that are not a FlagOverride shape', async () => {
    localStorage.setItem(
      OVERRIDES_KEY,
      JSON.stringify({ 'good-flag': { type: 'BOOLEAN', value: true }, 'bad-flag': null })
    )
    const state = await readFlagState()
    expect(state?.overrides).toEqual({ 'good-flag': { type: 'BOOLEAN', value: true } })
  })

  it('round-trips a written override', async () => {
    await writeOverride('flag-a', { type: 'STRING', value: 'control' })
    expect(await readFlagState()).toEqual({
      overrides: { 'flag-a': { type: 'STRING', value: 'control' } },
      devtoolsEnabled: false,
    })
  })

  it('deletes a single override without touching others', async () => {
    await writeOverride('flag-a', { type: 'STRING', value: 'control' })
    await writeOverride('flag-b', { type: 'BOOLEAN', value: true })
    await deleteOverride('flag-a')
    expect((await readFlagState())?.overrides).toEqual({ 'flag-b': { type: 'BOOLEAN', value: true } })
  })

  it('clears all overrides', async () => {
    await writeOverride('flag-a', { type: 'STRING', value: 'control' })
    await clearAllOverrides()
    expect((await readFlagState())?.overrides).toEqual({})
  })

  it('preserves a __proto__ property in a JSON override value (not treated as a prototype setter)', async () => {
    // A naive object-literal write would interpret `__proto__` as a prototype setter and drop it,
    // silently persisting {}. Build from JSON data instead so it stays a real own property.
    const value = JSON.parse('{"__proto__":{"enabled":true}}') as object
    await writeOverride('json-flag', { type: 'JSON', value })

    const storedValue = (await readFlagState())?.overrides['json-flag'].value as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(storedValue, '__proto__')).toBe(true)
    expect(storedValue['__proto__']).toEqual({ enabled: true })
  })

  describe('site scoping', () => {
    const override = { type: 'BOOLEAN', value: true } as const

    it("keeps a site's overrides in its own store and mirrors them into the key the wrapper reads", async () => {
      await writeOverride('dark-mode', override, STAGING)

      expect(stored(siteOverridesKey(STAGING))).toEqual({ 'dark-mode': override })
      expect(stored(OVERRIDES_KEY)).toEqual({ 'dark-mode': override })
    })

    it('reads only the connected site when given one', async () => {
      await writeOverride('dark-mode', override, STAGING)
      await syncSiteOverrides(US1)

      expect((await readFlagState(STAGING))?.overrides).toEqual({ 'dark-mode': override })
      expect((await readFlagState(US1))?.overrides).toEqual({})
    })

    it('reports every stored override when signed out, even one the page has not reloaded away from', async () => {
      await writeOverride('dark-mode', override, STAGING)
      // Switching empties the projection, but the page keeps applying staging's until it reloads —
      // so the signed-out notice must still offer to clear it.
      await syncSiteOverrides(US1)

      expect((await readFlagState())?.overrides).toEqual({ 'dark-mode': override })
    })

    it("stops one site's override from applying on another", async () => {
      await writeOverride('dark-mode', override, STAGING)

      const result = await syncSiteOverrides(US1)

      // The page would otherwise still be running staging's value under US1.
      expect(stored(OVERRIDES_KEY)).toEqual({})
      expect(result?.changed).toBe(true)
      // Staging keeps its own copy, so switching back restores it.
      expect(stored(siteOverridesKey(STAGING))).toEqual({ 'dark-mode': override })
    })

    it('reports no change when the page is already running this site, so no reload is demanded', async () => {
      await writeOverride('dark-mode', override, STAGING)
      expect((await syncSiteOverrides(STAGING))?.changed).toBe(false)
    })

    it('adopts pre-scoping overrides into the first site connected, without disturbing the page', async () => {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ legacy: override }))

      const result = await syncSiteOverrides(STAGING)

      expect(stored(siteOverridesKey(STAGING))).toEqual({ legacy: override })
      expect(result?.changed).toBe(false)
    })

    it('does not adopt again once a site store holds something, or every site would inherit the last one', async () => {
      await writeOverride('dark-mode', override, STAGING)
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ 'dark-mode': override }))

      await syncSiteOverrides(US1)

      expect(stored(OVERRIDES_KEY)).toEqual({})
      expect(localStorage.getItem(siteOverridesKey(US1))).toBeNull()
    })

    it('writes no store for a site with nothing in it, so adoption stays available on a clean page', async () => {
      await syncSiteOverrides(US1)
      expect(localStorage.getItem(siteOverridesKey(US1))).toBeNull()

      // An override written straight to the wrapper's key afterwards is adopted, not wiped.
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ legacy: override }))
      await syncSiteOverrides(US1)

      expect(stored(OVERRIDES_KEY)).toEqual({ legacy: override })
      expect(stored(siteOverridesKey(US1))).toEqual({ legacy: override })
    })

    it("clearing while connected leaves the other sites' overrides alone", async () => {
      await writeOverride('dark-mode', override, STAGING)
      await writeOverride('other-flag', override, US1)

      await clearAllOverrides(US1)

      expect(stored(siteOverridesKey(US1))).toEqual({})
      expect(stored(siteOverridesKey(STAGING))).toEqual({ 'dark-mode': override })
    })

    it('clearing while signed out wipes every store, so nothing reappears on reconnect', async () => {
      await writeOverride('dark-mode', override, STAGING)
      await writeOverride('other-flag', override, US1)

      await clearAllOverrides()

      expect(stored(OVERRIDES_KEY)).toEqual({})
      expect(localStorage.getItem(siteOverridesKey(STAGING))).toBeNull()
      expect(localStorage.getItem(siteOverridesKey(US1))).toBeNull()
    })
  })
})
