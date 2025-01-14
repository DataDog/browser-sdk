import type { RumErrorEvent } from '@datadog/browser-rum-core'
import { createTest, flushEvents, html } from '../../lib/framework'
import { getBrowserName, getPlatformName, withBrowserLogs } from '../../lib/helpers/browser'

// Note: using `browser.execute` to throw exceptions may result in "Script error." being reported,
// because WDIO is evaluating the script in a different context than the page.
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
    </script>
  `
}

describe('rum errors', () => {
  createTest('send console.error errors')
    .withRum()
    .withBody(createBody('console.error("oh snap")'))
    .run(async ({ intakeRegistry, baseUrl }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'console',
        handlingStack: ['Error: ', `handler @ ${baseUrl}/:`],
        handling: 'handled',
      })
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('pass Error instance to console.error')
    .withRum()
    .withBody(createBody('console.error("Foo:", foo())'))
    .run(async ({ intakeRegistry, baseUrl }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'Foo: Error: oh snap',
        source: 'console',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}/:`, `handler @ ${baseUrl}/:`],
        handlingStack: ['Error: ', `handler @ ${baseUrl}/:`],
        handling: 'handled',
      })
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send uncaught exceptions')
    .withRum()
    .withBody(createBody('throw foo()'))
    .run(async ({ intakeRegistry, baseUrl }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'source',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}/:`, `handler @ ${baseUrl}/:`],
        handling: 'unhandled',
      })
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send unhandled rejections')
    .withRum()
    .withBody(createBody('Promise.reject(foo())'))
    .run(async ({ intakeRegistry, baseUrl }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'source',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}/:`, `handler @ ${baseUrl}/:`],
        handling: 'unhandled',
      })
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send custom errors')
    .withRum()
    .withBody(createBody('DD_RUM.addError(foo())'))
    .run(async ({ intakeRegistry, baseUrl }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectError(intakeRegistry.rumErrorEvents[0].error, {
        message: 'oh snap',
        source: 'custom',
        stack: ['Error: oh snap', `at foo @ ${baseUrl}/:`, `handler @ ${baseUrl}/:`],
        handlingStack: ['Error: ', `handler @ ${baseUrl}/:`],
        handling: 'handled',
      })
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(0)
      })
    })

  // Ignore this test on Safari and firefox untill we upgrade because:
  // - Safari < 15 don't report the property disposition
  // - Firefox < 99 don't report csp violation at all
  // TODO: Remove this condition when upgrading to Safari 15 and Firefox 99 (see: https://datadoghq.atlassian.net/browse/RUM-1063)
  if (!((getBrowserName() === 'safari' && getPlatformName() === 'macos') || getBrowserName() === 'firefox')) {
    createTest('send CSP violation errors')
      .withRum()
      .withBody(
        createBody(`
      const script = document.createElement('script');
      script.src = "https://example.com/foo.js"
      document.body.appendChild(script)
      `)
      )
      .run(async ({ intakeRegistry, baseUrl }) => {
        const button = $('button')
        await button.click()

        await flushEvents()

        expect(intakeRegistry.rumErrorEvents.length).toBe(1)
        expectError(intakeRegistry.rumErrorEvents[0].error, {
          message: /^csp_violation: 'https:\/\/example\.com\/foo\.js' blocked by 'script-src(-elem)?' directive$/,
          source: 'report',
          stack: [
            /^script-src(-elem)?: 'https:\/\/example\.com\/foo\.js' blocked by 'script-src(-elem)?' directive of the policy/,
            `  at <anonymous> @ ${baseUrl}/:`,
          ],
          handling: 'unhandled',
          csp: {
            disposition: 'enforce',
          },
        })
        await withBrowserLogs((browserLogs) => {
          expect(browserLogs.length).toEqual(1)
        })
      })
  }
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
    expect(actualLines.length).toBe(expectedLines.length)
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
