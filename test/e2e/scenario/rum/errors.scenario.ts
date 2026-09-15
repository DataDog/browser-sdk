import type { RumErrorEvent } from '@datadog/browser-rum-core'
import { test, expect } from '@playwright/test'
import { createTest, html, npmSetup } from '../../lib/framework'

declare global {
  interface Window {
    DD_WASM_PLUGIN?: () => { name: string }
  }
}

// Note: using `browser.execute` to throw exceptions may result in "Script error." being reported,
// Use createBody because `page.evaluate()` runs in a different context and breaks stack traces.
function createBody(errorGenerator: string) {
  return html`
    <button>click me</button>
    <script>
      const button = document.querySelector('button')
      button.addEventListener('click', function handler() {
        ${errorGenerator}
      })
      function foo() {
        return new Error('oh snap')
      }
      function customError() {
        class CustomTestError extends Error {}
        return new CustomTestError('oh snap')
      }
      function customErrorWithInheritance() {
        class CustomTestError extends Error {}
        class CustomTestError2 extends CustomTestError {}

        // this is an anonymous class, which has no name
        // we're checking if the stacktrace is correctly reported for this specific case (with the class name missing)
        return new (class extends CustomTestError2 {
          constructor(e) {
            super(e)
            this.name = 'CustomTestError3'
          }
        })('oh snap')
      }
    </script>
  `
}

test.describe('rum errors', () => {
  createTest('send WebAssembly runtime errors with module metadata')
    .withSetup(npmSetup)
    .withRum()
    .withWasmUnsafeEval()
    .withRumInit((configuration) => {
      // The wasm plugin is only available in the npm setup, where the SDK and the plugin share
      // the same browser-core instance (and thus the same wasm module registry).
      configuration.plugins = [window.DD_WASM_PLUGIN!()]
      window.DD_RUM!.init(configuration)
    })
    .run(async ({ baseUrl, intakeRegistry, flushEvents, page, withBrowserLogs }) => {
      test.skip(
        test.info().project.name === 'webkit' || test.info().project.name === 'chromium-pinned',
        'These browser versions do not expose uncaught WebAssembly traps through the runtime error event'
      )

      await page.evaluate(async () => {
        const { instance } = await WebAssembly.instantiateStreaming(fetch('/test-module.wasm'))

        // Schedule the trap outside page.evaluate() so it is reported through
        // the browser's uncaught runtime-error path.
        setTimeout(() => (instance.exports.run as () => void)())
      })

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expect(intakeRegistry.rumErrorEvents[0].error.source_type).toBe('browser+wasm')
      expect(intakeRegistry.rumErrorEvents[0].error.wasm_modules).toEqual([
        { url: new URL('/test-module.wasm', baseUrl).href, build_id: 'abcd' },
      ])
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send console.error errors')
    .withRum()
    .withBody(createBody('console.error("oh snap")'))
    .run(async ({ page, intakeRegistry, baseUrl, flushEvents, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'console',
        handlingStack: ['HandlingStack: console error', `handler @ ${baseUrl}:`],
        handling: 'handled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('pass Error instance to console.error')
    .withRum()
    .withBody(createBody('console.error("Foo:", foo())'))
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'Foo: Error: oh snap',
        source: 'console',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handlingStack: ['HandlingStack: console error', `handler @ ${baseUrl}:`],
        handling: 'handled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send uncaught exceptions')
    .withRum()
    .withBody(createBody('throw foo()'))
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'source',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handling: 'unhandled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send runtime errors happening before initialization')
    .withRum()
    .withRumInit((configuration) => {
      // Use a setTimeout to:
      // * have a constant stack trace regardless of the setup used
      // * avoid the exception to be swallowed by the `onReady` logic
      setTimeout(() => {
        throw new Error('oh snap')
      })
      // Simulate a late initialization of the RUM SDK
      setTimeout(() => window.DD_RUM!.init(configuration))
    })
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs, baseUrl }) => {
      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'source',
        handling: 'unhandled',
        // The second frame is the inner setTimeout callback. Most browsers report it as
        // `<anonymous>`, but Firefox uses the lexical parent function name and reports it as
        // `window.RUM_INIT/<` (or even `window.RUM_INIT/</<`) when running with the `npm` setup,
        // because the test's rumInit callback is wrapped in a `window.RUM_INIT` arrow function.
        stack: ['Error: oh snap', new RegExp(`(<anonymous>|window\\.RUM_INIT(/<)+) @ ${baseUrl}:`)],
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send unhandled rejections')
    .withRum()
    .withBody(createBody('Promise.reject(foo())'))
    .run(async ({ flushEvents, page, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'source',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handling: 'unhandled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send custom errors')
    .withRum()
    .withBody(createBody('DD_RUM.addError(foo())'))
    .run(async ({ flushEvents, page, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'custom',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handlingStack: ['HandlingStack: error', `handler @ ${baseUrl}:`],
        handling: 'handled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(0)
      })
    })

  // non-native errors should have the same stack trace as regular errors on ALL BROWSERS
  createTest('send non-native errors')
    .withRum()
    .withBody(createBody('DD_RUM.addError(customError())'))
    .run(async ({ flushEvents, page, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'custom',
        stack: ['Error: oh snap', `at customError @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handlingStack: ['HandlingStack: error', `handler @ ${baseUrl}:`],
        handling: 'handled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(0)
      })
    })

  // non-native should have the same stack trace as regular errors on ALL BROWSERS
  // this should also work for custom error classes that inherit from other custom error classes
  createTest('send non-native errors with inheritance')
    .withRum()
    .withBody(createBody('DD_RUM.addError(customErrorWithInheritance())'))
    .run(async ({ flushEvents, page, intakeRegistry, baseUrl, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)

      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'custom',
        stack: ['CustomTestError3: oh snap', `at customErrorWithInheritance @ ${baseUrl}:`, `handler @ ${baseUrl}:`],
        handlingStack: ['HandlingStack: error', `handler @ ${baseUrl}:`],
        handling: 'handled',
      })
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(0)
      })
    })

  createTest('send CSP violation errors')
    .withRum()
    .withBody(
      createBody(`
      const script = document.createElement('script');
      script.src = "https://example.com/foo.js"
      document.body.appendChild(script)
      `)
    )
    .run(async ({ page, browserName, intakeRegistry, baseUrl, flushEvents, withBrowserLogs }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: /^csp_violation: 'https:\/\/example\.com\/foo\.js' blocked by 'script-src(-elem)?' directive$/,
        source: 'report',
        stack: [
          /^script-src(-elem)?: 'https:\/\/example\.com\/foo\.js' blocked by 'script-src(-elem)?' directive of the policy/,
          `  at <anonymous> @ ${baseUrl}:`,
        ],
        handling: 'unhandled',
        csp: {
          disposition: 'enforce',
        },
      })
      withBrowserLogs((browserLogs) => {
        if (browserName === 'firefox') {
          // Firefox has an additional Warning log: "Loading failed for the <script> with source 'https://example.com/foo.js'"
          expect(browserLogs).toHaveLength(2)
        } else {
          expect(browserLogs).toHaveLength(1)
        }
      })
    })
})

function expectError(
  error: RumErrorEvent['error'],
  expected: {
    message: string | RegExp
    source: string
    stack?: Array<string | RegExp>
    handlingStack?: Array<string | RegExp>
    handling: 'handled' | 'unhandled'
    csp?: {
      disposition?: 'enforce' | 'report'
    }
  }
) {
  expect(error.message).toMatch(expected.message)
  expect(error.source).toBe(expected.source)
  expectStack(error.stack, expected.stack)
  expectStack(error.handling_stack, expected.handlingStack)
  expect(error.handling).toBe(expected.handling)
  expect(error.csp?.disposition).toBe(expected.csp?.disposition)
}

function expectStack(stack: string | undefined, expectedLines?: Array<string | RegExp>) {
  if (expectedLines === undefined) {
    expect(stack).toBeUndefined()
  } else {
    expect(stack).toBeDefined()
    const actualLines = stack!.split('\n')
    expect.soft(actualLines.length).toBeGreaterThanOrEqual(expectedLines.length)
    // We don't test for a specific line number because it can be different between browsers. In
    // particular, Firefox seems to collect async stack traces.

    expectedLines.forEach((line, i) => {
      if (typeof line !== 'string') {
        return expect(actualLines[i]).toMatch(line)
      }

      if (i === 0) {
        expect(actualLines[i]).toMatch(line)
      } else {
        expect(actualLines[i]).toContain(line)
      }
    })
  }
}
