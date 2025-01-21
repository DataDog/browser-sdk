// <reference types="jasmine" />

import * as vitest from 'vitest'
import jasmineRequire from 'jasmine-core/lib/jasmine-core/jasmine.js'

const jasmineLib = jasmineRequire.core(jasmineRequire)
const env = jasmineLib.getEnv()

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

// After each is executed before `onTestFinished`, so it's too soon to clear the spies
vitest.beforeEach(() => {
  vitest.onTestFinished(() => {
    spyRegistry.clearSpies()
    spiesForCurrentTest.length = 0
  })
})

await import('../../packages/core/test/forEach.ts')
