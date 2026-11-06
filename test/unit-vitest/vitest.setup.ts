// <reference types="jasmine" />
/// <reference path="./providedContext.d.ts" />
// The shim drives jasmine-core internals, which are untyped.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-function-type */

import * as vitest from 'vitest'
import jasmineRequire from 'jasmine-core/lib/jasmine-core/jasmine.js'

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

// Like Jasmine (with `stopSpecOnExpectationFailure`), record failures before throwing them, so the
// test still fails if the code under test catches the error (ex: `callMonitored(() => expect(...))`).
// Recorded failures that were not reported are checked once the test finishes (see below).
let failuresOfCurrentTest: Error[] = []
function recordFailure(error: Error) {
  failuresOfCurrentTest.push(error)
  return error
}

const pp = jasmineLib.makePrettyPrinter()
const matchersUtil = new jasmineLib.MatchersUtil({ customTesters: [], pp })

function addExpectationResult(passed: boolean, result: { message: string }) {
  if (!passed) {
    throw recordFailure(new Error(result.message))
  }
}

window.expect = ((actual: any) =>
  jasmineLib.Expectation.factory({ matchersUtil, actual, addExpectationResult })) as unknown as typeof window.expect

window.expectAsync = (actual: any) =>
  jasmineLib.Expectation.asyncFactory({ matchersUtil, actual, addExpectationResult })

window.fail = (error?: unknown) => {
  if (error instanceof Error) {
    throw recordFailure(error)
  }
  throw recordFailure(
    new Error(error === undefined ? 'Failed' : `Failed: ${typeof error === 'string' ? error : pp(error)}`)
  )
}

// Fail tests that call console methods without spying on them, to keep the test output clean.
// Calls made after a test ends are reported by the next test.
// With `isolate: false`, this file runs again for each spec file in the same page: patch the console
// only once, and share the calls across spec files so none is lost between two files.
const UNEXPECTED_CONSOLE_CALLS = Symbol.for('vitest.setup.unexpectedConsoleCalls')
const unexpectedConsoleCalls: string[] | undefined = vitest.inject('failOnUnexpectedConsoleCalls')
  ? ((window as any)[UNEXPECTED_CONSOLE_CALLS] ??= trackConsoleCalls())
  : undefined

function trackConsoleCalls() {
  const calls: string[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const originalMethod = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      calls.push(`${method}: ${args.map(String).join(' ')}`)
      originalMethod(...args)
    }
  }
  return calls
}

// `onTestFinished` hooks run in reverse order: registering these before the spy cleanup below and the
// `registerCleanupTask()` tasks makes them run after, as cleanups can fail expectations or call
// console methods too.
vitest.beforeEach(() => {
  failuresOfCurrentTest = []
  vitest.onTestFinished(({ task }) => {
    const reportedMessages = task.result?.errors?.map((error) => error.message) ?? []
    // Like Jasmine, which stops the test at its first failure, only report the first one
    const unreportedFailure = failuresOfCurrentTest.find((error) => !reportedMessages.includes(error.message))
    failuresOfCurrentTest = []
    if (unreportedFailure) {
      throw unreportedFailure
    }
  })
  vitest.onTestFinished(() => {
    if (unexpectedConsoleCalls?.length) {
      throw new Error(`Unexpected console calls:\n${unexpectedConsoleCalls.splice(0).join('\n')}`)
    }
  })
})

// After each is executed before `onTestFinished`, so it's too soon to clear the spies
vitest.beforeEach(() => {
  vitest.onTestFinished(() => {
    spyRegistry.clearSpies()
    spiesForCurrentTest.length = 0
  })
})
