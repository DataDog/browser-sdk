// <reference types="jasmine" />
/// <reference path="./providedContext.d.ts" />
// The shim drives jasmine-core internals, which are untyped.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-function-type */

import * as vitest from 'vitest'
import jasmineRequire from 'jasmine-core/lib/jasmine-core/jasmine.js'
import { trackCurrentJasmineSpec } from './getCurrentJasmineSpec'

const jasmineLib = jasmineRequire.core(jasmineRequire)
// Vitest is the runner: don't let Jasmine install its global error handlers, which forward
// unhandled rejections to `window.onerror` and would report them a second time.
const env = jasmineLib.getEnv({ suppressLoadErrors: true })

// Create a standalone SpyRegistry that doesn't require a jasmine execution context.
// vitest's afterEach (registered below) will clear it between tests.
const spiesForCurrentTest: any[] = []
const spyRegistry = new jasmineLib.SpyRegistry({
  currentSpies: () => spiesForCurrentTest,
  createSpy: (name: string, fn: Function) => env.createSpy(name, fn),
})

window.spyOn = (object, method) => spyRegistry.spyOn(object, method)
window.spyOnProperty = (object, property, accessType) => spyRegistry.spyOnProperty(object, property, accessType)

window.jasmine = {
  ...jasmineLib,
  getEnv: () => env,
  clock: () => env.clock,
  createSpy: (name, originalFn) => env.createSpy(name, originalFn),
  createSpyObj: (...args: any[]) => env.createSpyObj(...args),
}

// Wrap test/hook functions to support Jasmine's `done` callback pattern, which Vitest v4 dropped.
// If a function accepts 1+ parameters, we assume the first is `done` and wrap it in a Promise.
function supportDone(fn: jasmine.ImplementationCallback): () => unknown {
  if (fn.length === 0) {
    return fn as () => unknown
  }
  return () =>
    new Promise<void>((resolve, reject) => {
      const done: any = () => resolve()
      done.fail = (error?: unknown) => reject(error instanceof Error ? error : new Error(String(error)))
      const result = fn(done)
      if (result && typeof result.then === 'function') {
        throw new Error('Either use the done parameter or return a Promise, not both')
      }
    })
}

// Support Jasmine's `pending()` — skips the current test at runtime using the Vitest context.
let currentTestCtx: vitest.TestContext | null = null
vitest.beforeEach((ctx) => {
  currentTestCtx = ctx
})
vitest.afterEach(() => {
  currentTestCtx = null
})
window.pending = (reason) => currentTestCtx?.skip(reason)

trackCurrentJasmineSpec()

window.describe = vitest.describe
window.fdescribe = vitest.describe.only
window.xdescribe = vitest.describe.skip
window.it = (name, fn, timeout) => vitest.it(name, fn && supportDone(fn), timeout)
window.fit = (name, fn, timeout) => vitest.it.only(name, fn && supportDone(fn), timeout)
window.xit = (name, fn, timeout) => vitest.it.skip(name, fn && supportDone(fn), timeout)
window.beforeEach = (fn, timeout) => vitest.beforeEach(supportDone(fn), timeout)
window.afterEach = (fn, timeout) => vitest.afterEach(supportDone(fn), timeout)
window.beforeAll = (fn, timeout) => vitest.beforeAll(supportDone(fn), timeout)
window.afterAll = (fn, timeout) => vitest.afterAll(supportDone(fn), timeout)

const matchersUtil = new jasmineLib.MatchersUtil({
  customTesters: [],
  pp: jasmineLib.makePrettyPrinter(),
})

window.expect = ((actual: any) =>
  jasmineLib.Expectation.factory({
    matchersUtil,
    actual,
    addExpectationResult(passed: boolean, result: any) {
      if (!passed) {
        throw new Error(result.message)
      }
    },
  })) as unknown as typeof window.expect

window.expectAsync = (actual: any) =>
  jasmineLib.Expectation.asyncFactory({
    matchersUtil,
    actual,
    addExpectationResult(passed: boolean, result: any) {
      if (!passed) {
        throw new Error(result.message)
      }
    },
  })

// Fail tests that call console methods without spying on them, to keep the test output clean.
// Calls made after a test ends are reported by the next test.
if (vitest.inject('failOnUnexpectedConsoleCalls')) {
  const unexpectedConsoleCalls: string[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const originalMethod = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      unexpectedConsoleCalls.push(`${method}: ${args.map(String).join(' ')}`)
      originalMethod(...args)
    }
  }
  vitest.afterEach(() => {
    if (unexpectedConsoleCalls.length) {
      const calls = unexpectedConsoleCalls.splice(0)
      throw new Error(`Unexpected console calls:\n${calls.join('\n')}`)
    }
  })
}

// After each is executed before `onTestFinished`, so it's too soon to clear the spies
vitest.beforeEach(() => {
  vitest.onTestFinished(() => {
    spyRegistry.clearSpies()
    spiesForCurrentTest.length = 0
  })
})
