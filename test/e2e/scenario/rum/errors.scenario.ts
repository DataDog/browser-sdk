import type { RumErrorEvent } from '@datadog/browser-rum-core'
import { createTest, flushEvents, html } from '../../lib/framework'
import { withBrowserLogs } from '../../lib/helpers/browser'

// Note: using `browserExecute` to throw exceptions may result in "Script error." being reported,
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
    .run(async ({ serverEvents, baseUrl }) => {
      const button = await $('button')
      await button.click()

      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expectError(serverEvents.rumErrors[0].error, {
        message: 'console error: oh snap',
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
    .run(async ({ serverEvents, baseUrl }) => {
      const button = await $('button')
      await button.click()

      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expectError(serverEvents.rumErrors[0].error, {
        message: 'console error: Foo: Error: oh snap',
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
    .run(async ({ serverEvents, baseUrl }) => {
      const button = await $('button')
      await button.click()

      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expectError(serverEvents.rumErrors[0].error, {
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
    .run(async ({ serverEvents, baseUrl }) => {
      const button = await $('button')
      await button.click()

      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expectError(serverEvents.rumErrors[0].error, {
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
    .run(async ({ serverEvents, baseUrl }) => {
      const button = await $('button')
      await button.click()

      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expectError(serverEvents.rumErrors[0].error, {
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
})

function expectError(
  error: RumErrorEvent['error'],
  expected: {
    message: string
    source: string
    stack?: string[]
    handlingStack?: string[]
    handling: 'handled' | 'unhandled'
  }
) {
  expect(error.message).toBe(expected.message)
  expect(error.source).toBe(expected.source)
  expectStack(error.stack, expected.stack)
  expectStack(error.handling_stack, expected.handlingStack)
  expect(error.handling).toBe(expected.handling)
}

function expectStack(stack: string | undefined, expectedLines?: string[]) {
  if (expectedLines === undefined) {
    expect(stack).toBeUndefined()
  } else {
    expect(stack).toBeDefined()
    const actualLines = stack!.split('\n')
    expect(actualLines.length).toBe(expectedLines.length)
    expectedLines.forEach((line, i) => {
      if (i === 0) {
        expect(actualLines[i]).toBe(line)
      } else {
        expect(actualLines[i]).toContain(line)
      }
    })
  }
}
