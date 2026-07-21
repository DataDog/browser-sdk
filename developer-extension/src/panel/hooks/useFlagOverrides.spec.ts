import { registerCleanupTask } from '../../../../packages/browser-core/test'
import {
  DEVTOOLS_MARKER_KEY,
  OVERRIDES_KEY,
  readFlagState,
  validateOverrideValue,
  writeOverrides,
} from './useFlagOverrides'

describe('useFlagOverrides helpers', () => {
  describe('validateOverrideValue', () => {
    it('accepts values matching their declared type', () => {
      expect(validateOverrideValue('BOOLEAN', true)).toBeNull()
      expect(validateOverrideValue('STRING', 'hello')).toBeNull()
      expect(validateOverrideValue('INTEGER', 3)).toBeNull()
      expect(validateOverrideValue('NUMERIC', 3.14)).toBeNull()
      expect(validateOverrideValue('JSON', { a: 1 })).toBeNull()
    })

    it('rejects null', () => {
      expect(validateOverrideValue('STRING', null)).toBe('Value cannot be null')
    })

    it('rejects type mismatches', () => {
      expect(validateOverrideValue('BOOLEAN', 'true')).toContain('must be a boolean')
      expect(validateOverrideValue('STRING', 1)).toContain('must be a string')
      expect(validateOverrideValue('NUMERIC', 'x')).toContain('must be a number')
    })

    it('rejects non-integer INTEGER values', () => {
      expect(validateOverrideValue('INTEGER', 3.5)).toBe('INTEGER value must be a whole number')
    })
  })

  describe('read/write against page localStorage', () => {
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

    it('ignores malformed override JSON', async () => {
      localStorage.setItem(OVERRIDES_KEY, 'not json')
      const state = await readFlagState()
      expect(state.overrides).toEqual({})
    })

    it('round-trips written overrides', async () => {
      await writeOverrides({ 'flag-a': { type: 'STRING', value: 'control' } })
      expect(await readFlagState()).toEqual({
        overrides: { 'flag-a': { type: 'STRING', value: 'control' } },
        devtoolsEnabled: false,
      })
    })
  })
})
