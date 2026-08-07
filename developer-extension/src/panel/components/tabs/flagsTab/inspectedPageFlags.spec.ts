import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import {
  DEVTOOLS_MARKER_KEY,
  OVERRIDES_KEY,
  clearAllOverrides,
  deleteOverride,
  readFlagState,
  writeOverride,
} from './inspectedPageFlags'

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
    registerCleanupTask(() => {
      ;(globalThis as any).chrome = previousChrome
      localStorage.removeItem(OVERRIDES_KEY)
      localStorage.removeItem(DEVTOOLS_MARKER_KEY)
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
})
