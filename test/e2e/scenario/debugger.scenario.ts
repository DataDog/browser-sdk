/* eslint-disable @typescript-eslint/no-unsafe-call, camelcase */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest } from '../lib/framework'
import type { Servers } from '../lib/framework'

function setDebuggerProbes(servers: Servers, probes: object[]) {
  servers.base.app.setDebuggerProbes(probes)
}

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
 * Injects an instrumented function into the page that calls the debugger hooks.
 * The function is named `testFunction` and registered under the `TestModule;testFunction` function ID.
 */
async function injectInstrumentedFunction(page: Page) {
  await page.evaluate(() => {
    const $dd_probes = (globalThis as any).$dd_probes as (id: string) => unknown[] | undefined
    const $dd_entry = (globalThis as any).$dd_entry as (probes: unknown[], self: unknown, args: object) => void
    const $dd_return = (globalThis as any).$dd_return as (
      probes: unknown[],
      value: unknown,
      self: unknown,
      args: object,
      locals: object
    ) => unknown

    ;(window as any).testFunction = function testFunction(a: unknown, b: unknown) {
      const probes = $dd_probes('TestModule;testFunction')
      if (probes) {
        $dd_entry(probes, this, { a, b })
      }
      const result = String(a) + String(b)
      const returnValue = result
      if (probes) {
        return $dd_return(probes, returnValue, this, { a, b }, { result })
      }
      return returnValue
    }
  })
}

/**
 * Injects an instrumented function that throws, triggering `$dd_throw`.
 */
async function injectThrowingFunction(page: Page) {
  await page.evaluate(() => {
    const $dd_probes = (globalThis as any).$dd_probes as (id: string) => unknown[] | undefined
    const $dd_entry = (globalThis as any).$dd_entry as (probes: unknown[], self: unknown, args: object) => void
    const $dd_throw = (globalThis as any).$dd_throw as (
      probes: unknown[],
      error: Error,
      self: unknown,
      args: object
    ) => void

    ;(window as any).throwingFunction = function throwingFunction(msg: string) {
      const probes = $dd_probes('TestModule;throwingFunction')
      if (probes) {
        $dd_entry(probes, this, { msg })
      }
      try {
        throw new Error(msg)
      } catch (e) {
        if (probes) {
          $dd_throw(probes, e as Error, this, { msg })
        }
        throw e
      }
    }
  })
}

test.describe('debugger', () => {
  createTest('send debugger snapshot when instrumented function is called')
    .withDebugger()
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe()
      setDebuggerProbes(servers, [probe])

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
      expect(event.hostname).toBeDefined()

      const snapshot = (event.debugger as any).snapshot
      expect(snapshot.probe.id).toBe('test-probe-1')
      expect(snapshot.language).toBe('javascript')
      expect(snapshot.duration).toBeGreaterThan(0)
    })

  createTest('capture function arguments and return value')
    .withDebugger()
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe({ captureSnapshot: true })
      setDebuggerProbes(servers, [probe])

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
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe({
        typeName: 'TestModule',
        methodName: 'throwingFunction',
      })
      setDebuggerProbes(servers, [probe])

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
    })

  createTest('evaluate probe message template with expression segments')
    .withDebugger()
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe({
        template: '',
        segments: [
          { str: 'Result is: ' },
          { dsl: 'a', json: { ref: 'a' } },
          { str: ' and ' },
          { dsl: 'b', json: { ref: 'b' } },
        ],
      })
      setDebuggerProbes(servers, [probe])

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
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe({
        evaluateAt: 'EXIT',
        condition: {
          dsl: '$dd_return == "match"',
          json: { eq: [{ ref: '$dd_return' }, 'match'] },
        },
      })
      setDebuggerProbes(servers, [probe])

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
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe({
        evaluateAt: 'EXIT',
        condition: {
          dsl: '$dd_return == "foobar"',
          json: { eq: [{ ref: '$dd_return' }, 'foobar'] },
        },
      })
      setDebuggerProbes(servers, [probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('foo', 'bar')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.debuggerEvents[0].message).toBe('Probe hit')
    })

  createTest('include RUM correlation data when RUM is active')
    .withRum()
    .withDebugger()
    .run(async ({ intakeRegistry, flushEvents, page, browserName, servers }) => {
      test.skip(browserName !== 'chromium', 'Debugger tests require Chromium')

      const probe = makeProbe()
      setDebuggerProbes(servers, [probe])

      await page.reload()
      await injectInstrumentedFunction(page)

      await page.evaluate(() => {
        ;(window as any).testFunction('hello', ' world')
      })

      await flushEvents()

      expect(intakeRegistry.debuggerEvents.length).toBeGreaterThanOrEqual(1)

      const event = intakeRegistry.debuggerEvents[0]
      const dd = event.dd as { trace_id?: string; span_id?: string }
      expect(dd.trace_id).toBeDefined()
      expect(dd.trace_id).not.toBe('')
    })
})
