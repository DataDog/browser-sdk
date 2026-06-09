/* eslint-disable @typescript-eslint/no-unsafe-call, camelcase */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest } from '../lib/framework'

const DEBUGGER_POLL_INTERVAL = 1_000
const PROBE_WAIT_TIMEOUT = 30_000

function makeProbe({
  id = 'test-probe-1',
  version = 1,
  typeName = 'TestModule',
  methodName = 'testFunction',
  template = 'Probe hit',
  captureSnapshot = true,
  evaluateAt = 'EXIT' as const,
  condition,
  segments,
}: {
  id?: string
  version?: number
  typeName?: string
  methodName?: string
  template?: string
  captureSnapshot?: boolean
  evaluateAt?: 'ENTRY' | 'EXIT'
  condition?: { dsl: string; json: unknown }
  segments?: Array<{ str?: string; dsl?: string; json?: unknown }>
} = {}) {
  return {
    id,
    version,
    type: 'LOG_PROBE',
    where: { typeName, methodName },
    template,
    segments: segments ?? [{ str: template }],
    captureSnapshot,
    capture: {},
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt,
    when: condition,
  }
}

/**
 * Wait until the SDK has registered at least one probe for the given function ID.
 * `DD_DEBUGGER.init()` fetches probes asynchronously via the Delivery API, so we need to
 * poll until that initial fetch has applied to the probe registry before invoking the
 * instrumented function — otherwise the call would silently bypass the probe hooks.
 */
async function waitForProbe(page: Page, functionId: string) {
  await expect
    .poll(() => hasActiveProbe(page, functionId), {
      timeout: PROBE_WAIT_TIMEOUT,
    })
    .toBe(true)
}

async function waitForNoProbe(page: Page, functionId: string) {
  await expect
    .poll(() => hasActiveProbe(page, functionId), {
      timeout: PROBE_WAIT_TIMEOUT,
    })
    .toBe(false)
}

function hasActiveProbe(page: Page, functionId: string) {
  // Do not use page.waitForFunction() here: pinned Chromium evaluates its predicate through an eval-like path,
  // which is blocked by the test page CSP because it intentionally omits 'unsafe-eval'.
  return page.evaluate((id) => {
    const $dd_probes = (globalThis as any).$dd_probes as ((id: string) => unknown[] | undefined) | undefined
    return $dd_probes?.(id) !== undefined
  }, functionId)
}

/**
 * Injects an instrumented function into the page that calls the debugger hooks, and waits
 * for the SDK to register the corresponding probe before returning.
 * The function is named `testFunction` and registered under the `TestModule;testFunction` function ID.
 */
async function injectInstrumentedFunction(page: Page) {
  await injectInstrumentedFunctionWithoutWaiting(page)
  await waitForProbe(page, 'TestModule;testFunction')
}

/**
 * Injects the same instrumented function as `injectInstrumentedFunction`, but does not
 * wait for a probe. This lets polling tests observe the uninstrumented state first.
 */
async function injectInstrumentedFunctionWithoutWaiting(page: Page) {
  await page.evaluate(() => {
    ;(window as any).testFunction = function testFunction(a: unknown, b: unknown) {
      const probes = (window as any).$dd_probes('TestModule;testFunction')
      if (probes) {
        ;(window as any).$dd_entry(probes, this, { a, b })
      }
      const result = String(a) + String(b)
      const returnValue = result
      if (probes) {
        const instrumentedReturnValue = (window as any).$dd_return(probes, returnValue, this, { a, b }, { result }) as unknown
        return instrumentedReturnValue
      }
      return returnValue
    }
  })
}

/**
 * Injects an instrumented function that throws, triggering `$dd_throw`, and waits for the
 * SDK to register the corresponding probe before returning.
 */
async function injectThrowingFunction(page: Page) {
  await page.evaluate(() => {
    // Define the function through a page script so thrown errors get normal page-script stack frames.
    // Firefox/WebKit can expose empty or unparseable stacks for functions defined directly by page.evaluate().
    const script = document.createElement('script')
    script.textContent = `
      window.throwingFunction = function throwingFunction(msg) {
        const probes = window.$dd_probes('TestModule;throwingFunction')
        if (probes) {
          window.$dd_entry(probes, this, { msg })
        }
        try {
          throw new Error(msg)
        } catch (e) {
          if (probes) {
            window.$dd_throw(probes, e, this, { msg })
          }
          throw e
        }
      }
    `
    document.head.appendChild(script)
    script.remove()
  })
  await waitForProbe(page, 'TestModule;throwingFunction')
}

test.describe('debugger', () => {
  createTest('send debugger snapshot when instrumented function is called')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe()
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('hello', ' world')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)

      const event = intakeRegistry.debuggerEvents[0]
      expect(event.message).toBe('Probe hit')
      expect(event.service).toBe('browser-sdk-e2e-test')

      const snapshot = (event.debugger as any).snapshot
      expect(snapshot.probe.id).toBe('test-probe-1')
      expect(snapshot.language).toBe('javascript')
      expect(snapshot.duration).toBeGreaterThanOrEqual(0)
      expect(snapshot.captures.entry.arguments.this).toBeUndefined()
      expect(snapshot.captures.return.arguments.this).toBeUndefined()
    })

  createTest('capture function arguments and return value')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe({ captureSnapshot: true })
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('foo', 'bar')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)

      const snapshot = (intakeRegistry.debuggerEvents[0].debugger as any).snapshot
      expect(snapshot.captures).toBeDefined()
      expect(snapshot.captures.return).toBeDefined()

      const returnCapture = snapshot.captures.return
      expect(returnCapture.locals['@return']).toBeDefined()
      expect(returnCapture.locals['@return'].value).toBe('foobar')
    })

  createTest('capture exception in snapshot on throw')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe({
        typeName: 'TestModule',
        methodName: 'throwingFunction',
      })
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectThrowingFunction(page)

      await page.evaluate(() => {
        try {
          ;(window as any).throwingFunction('test error')
        } catch {
          // expected
        }
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)

      const snapshot = (intakeRegistry.debuggerEvents[0].debugger as any).snapshot
      expect(snapshot.captures.return.throwable).toBeDefined()
      expect(snapshot.captures.return.throwable.message).toBe('test error')

      const stacktrace = snapshot.captures.return.throwable.stacktrace
      expect(stacktrace).toBeDefined()
      expect(stacktrace.length).toBeGreaterThan(0)

      const firstFrame = stacktrace[0]
      expect(firstFrame.function).toEqual(expect.any(String))
      expect(firstFrame.fileName).toEqual(expect.any(String))
      expect(firstFrame.lineNumber).toEqual(expect.any(Number))
    })

  createTest('fetch probes from the Delivery API after initial load')
    .withDebugger({ pollInterval: DEBUGGER_POLL_INTERVAL })
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      datadogHttpApiControl.debugger.setDebuggerProbes([])

      await page.reload()
      await injectInstrumentedFunctionWithoutWaiting(page)
      await waitForNoProbe(page, 'TestModule;testFunction')

      datadogHttpApiControl.debugger.setDebuggerProbes([makeProbe()])
      await waitForProbe(page, 'TestModule;testFunction')

      await page.evaluate(() => {
        ;(window as any).testFunction('after', ' poll')
      })
      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.debuggerEvents[0].message).toBe('Probe hit')
    })

  createTest('stop sending snapshots after probe deletion is delivered')
    .withDebugger({ pollInterval: DEBUGGER_POLL_INTERVAL })
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe()
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      datadogHttpApiControl.debugger.setDebuggerProbeResponse({ deletions: [probe.id] })
      await waitForNoProbe(page, 'TestModule;testFunction')

      await page.evaluate(() => {
        ;(window as any).testFunction('after', ' deletion')
      })
      await flushEvents()

      expect(intakeRegistry.debuggerEvents).toHaveLength(0)
    })

  createTest('safely capture browser-native objects')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe()
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction(document.body, new MouseEvent('click'))
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.debuggerEvents[0].message).toBe('Probe hit')
    })

  createTest('evaluate probe message template with expression segments')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe({
        template: '',
        segments: [
          { str: 'Result is: ' },
          { dsl: 'a', json: { ref: 'a' } },
          { str: ' and ' },
          { dsl: 'b', json: { ref: 'b' } },
        ],
      })
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('X', 'Y')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.debuggerEvents[0].message).toBe('Result is: X and Y')
    })

  createTest('do not send snapshot when probe condition is not met')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe({
        evaluateAt: 'EXIT',
        condition: {
          dsl: '$dd_return == "match"',
          json: { eq: [{ ref: '$dd_return' }, 'match'] },
        },
      })
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('no', 'match')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents).toHaveLength(0)
    })

  createTest('send snapshot when probe condition is met')
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe({
        evaluateAt: 'EXIT',
        condition: {
          dsl: '$dd_return == "foobar"',
          json: { eq: [{ ref: '$dd_return' }, 'foobar'] },
        },
      })
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('foo', 'bar')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.debuggerEvents[0].message).toBe('Probe hit')
    })

  createTest('omit trace correlation data when no active span is available')
    .withRum()
    .withDebugger()
    .run(async ({ intakeRegistry, datadogHttpApiControl, flushEvents, page }) => {
      const probe = makeProbe()
      datadogHttpApiControl.debugger.setDebuggerProbes([probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('hello', ' world')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)

      const event = intakeRegistry.debuggerEvents[0]
      expect(event.dd).toBeUndefined()
    })
})
