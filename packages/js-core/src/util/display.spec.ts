import { vi, describe, expect, it } from 'vitest'
import { createDisplay, originalConsoleMethods } from './display'

const CONSOLE_METHODS = ['debug', 'log', 'info', 'warn', 'error'] as const

describe('display', () => {
  CONSOLE_METHODS.forEach((method) => {
    it(`${method}() forwards to the console method, prefixed`, () => {
      // Spy on the captured original *before* creating the display: createDisplay binds
      // `originalConsoleMethods[method]` at call time, so the bound method forwards to the spy.
      const consoleSpy = vi.spyOn(originalConsoleMethods, method)
      const display = createDisplay('[PREFIX]')

      display[method]('message')

      expect(consoleSpy).toHaveBeenCalledWith('[PREFIX]', 'message')
    })
  })
})
