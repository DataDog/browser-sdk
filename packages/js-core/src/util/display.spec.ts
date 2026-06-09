import type { Display } from './display'
import { createDisplay, originalConsoleMethods, setDebugMode } from './display'

const CONSOLE_METHODS = ['debug', 'log', 'info', 'warn', 'error'] as const

describe('display', () => {
  afterEach(() => {
    setDebugMode(false)
  })

  CONSOLE_METHODS.forEach((method) => {
    describe(`${method}()`, () => {
      let consoleSpy: jasmine.Spy
      let display: Display

      beforeEach(() => {
        // Spy on the captured original *before* creating the display: createDisplay binds
        // `originalConsoleMethods[method]` at call time, so the bound method forwards to the spy.
        consoleSpy = spyOn(originalConsoleMethods, method)
        display = createDisplay('[PREFIX]')
      })

      it('always logs to the console method, prefixed', () => {
        display[method]('message')

        expect(consoleSpy).toHaveBeenCalledOnceWith('[PREFIX]', 'message')
      })

      describe('ifDebugEnabled', () => {
        it('does not log when debug mode is disabled', () => {
          display.ifDebugEnabled[method]('message')

          expect(consoleSpy).not.toHaveBeenCalled()
        })

        it('logs to the console method, prefixed, when debug mode is enabled', () => {
          setDebugMode(true)

          display.ifDebugEnabled[method]('message')

          expect(consoleSpy).toHaveBeenCalledOnceWith('[PREFIX]', 'message')
        })
      })
    })
  })
})
