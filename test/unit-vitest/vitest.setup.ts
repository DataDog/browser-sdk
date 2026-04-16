// <reference types="jasmine" />

import * as vitest from 'vitest'
import jasmineRequire from 'jasmine-core/lib/jasmine-core/jasmine.js'

const jasmineLib = jasmineRequire.core(jasmineRequire)
const env = jasmineLib.getEnv()

// Create a standalone SpyRegistry that doesn't require a jasmine execution context.
// vitest's afterEach (registered below) will clear it between tests.
let v = fetch
Object.defineProperty(window, 'fetch', {
  get() {
    return v
  },
  set(value) {
    debugger
    v = value
  },
})
const spiesForCurrentTest: any[] = []
const spyRegistry = new jasmineLib.SpyRegistry({
  currentSpies: () => {
    return spiesForCurrentTest
  },
  createSpy: (name: string, fn: Function) => env.createSpy(name, fn),
})

window.spyOn = (object, method) => {
  console.log('SPY')
  return spyRegistry.spyOn(object, method)
}
window.spyOnProperty = (object, property, accessType) => spyRegistry.spyOnProperty(object, property, accessType)

window.jasmine = {
  ...jasmineLib,
  getEnv: () => env,
  clock: () => env.clock,
  createSpy: (name, originalFn) => env.createSpy(name, originalFn),
}

// Wrap test/hook functions to support Jasmine's `done` callback pattern, which Vitest v4 dropped.
// If a function accepts 1+ parameters, we assume the first is `done` and wrap it in a Promise.
function supportDone(fn: Function): Function {
  if (fn.length === 0) {
    return fn
  }
  return () =>
    new Promise<void>((resolve, reject) => {
      const done: any = (error?: any) => (error ? reject(error) : resolve())
      done.fail = (error?: any) => reject(error instanceof Error ? error : new Error(String(error)))
      const result = fn(done)
      if (result && typeof result.then === 'function') {
        ;(result as Promise<void>).then(resolve, reject)
      }
    })
}

// Support Jasmine's `pending()` — skips the current test at runtime using the Vitest context.
let currentTestCtx: any = null
vitest.beforeEach((ctx) => {
  currentTestCtx = ctx
})
vitest.afterEach(() => {
  currentTestCtx = null
})
window.pending = (reason?: string) => currentTestCtx?.skip(reason)

window.describe = vitest.describe
window.it = (name: any, fn?: any, timeout?: any) => vitest.it(name, fn && supportDone(fn), timeout)
window.beforeEach = (fn: any, timeout?: any) => vitest.beforeEach(supportDone(fn), timeout)
window.afterEach = (fn: any, timeout?: any) => vitest.afterEach(supportDone(fn), timeout)
window.beforeAll = (fn: any, timeout?: any) => vitest.beforeAll(supportDone(fn), timeout)
window.afterAll = (fn: any, timeout?: any) => vitest.afterAll(supportDone(fn), timeout)
window.fdescribe = vitest.describe.only
window.fit = (name: any, fn?: any, timeout?: any) => vitest.it.only(name, fn && supportDone(fn), timeout)
window.xdescribe = vitest.describe.skip
window.xit = (name: any, fn?: any, timeout?: any) => vitest.it.skip(name, fn && supportDone(fn), timeout)

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

console.log('A')
vitest.afterEach(() => {
  console.log('CLEAR')
  debugger
  spyRegistry.clearSpies()
  spiesForCurrentTest.length = 0
})

await import('../../packages/core/test/forEach.ts')
